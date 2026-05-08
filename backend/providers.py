"""Provider adapters for extraction."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import uuid
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, Dict, List

from .config import Settings
from .rag_index import LocalEmbeddingIndex

logger = logging.getLogger("data_extraction.providers")
ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")

OPENCODE_SYSTEM_PROMPT = """You are OpenCode, a non-interactive local file-backed data extraction and financial analysis agent.

The user provides files and a natural-language instruction. Use the attached local files, retrieved context, and table context as the source of truth. Do not use preset schemas, deterministic keyword matching, canned values, or example matrices.

The latest user query is the controlling instruction. Conversation memory and table context are only context for understanding follow-ups.

Return valid JSON only in this shape:
{"rows":[{"Document Name":"<source file name>","<natural column name>":"<value or analysis>"}]}

Rules:
- Use one row per source document unless the latest query asks for multiple rows.
- Infer simple natural column names from the latest user intent.
- For "extract financials", choose the most important financial measures supported by the document and put them as columns in the document row. Do not use a Metric/Value layout unless explicitly requested.
- For summary, deep research, risk scoring, explanation, or "why" questions, synthesize the requested analysis into one or more table columns instead of returning "Not found" just because the exact phrase is not a source label.
- For semantic substitutions such as turnover vs revenue, use the closest document-supported concept, label the column as requested, and include the mapping inside the cell text when needed.
- If a requested value truly cannot be supported from the local files, return "Not found".
- Format large monetary values compactly when the scale is clear: billions as $xB, millions as $xM, percentages as x%. If a source table is labeled "in millions", convert the displayed amount into its real scale before formatting.
- If browser/web knowledge is enabled, use it only for label interpretation and public context. Values extracted into the table must be supported by the uploaded files.
"""


class ProviderError(RuntimeError):
    pass


class BaseProvider(ABC):
    def __init__(self, settings: Settings):
        self.settings = settings

    @abstractmethod
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        raise NotImplementedError

    def _prompt(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> str:
        docs = "\n\n".join(
            f"Document: {doc['file_name']}\n{doc.get('text') or '[No extractable text found]'}"
            for doc in documents
        )
        requested_fields = fields or []
        return (
            "Extract data from each document. "
            "Return valid JSON only, with no markdown fences or prose. "
            "The JSON must be an object with a 'rows' array. Each row must include 'Document Name'. "
            "If requested_fields is empty, infer useful table columns from the user's request and the document. "
            "Do not use hard-coded preset schemas or keyword lists. If a value is not found, use 'Not found'.\n\n"
            "The latest user query is the controlling instruction. Conversation memory is context only; do not repeat "
            "a previous table schema unless the latest query asks for it.\n\n"
            "For follow-up requests such as 'instead of X, give me Y', use the conversation memory to understand "
            "the replacement intent. Return only Y as the extracted field unless the user explicitly asks for a full table; "
            "never split conversational words into columns.\n\n"
            f"requested_fields: {requested_fields}\n"
            f"User query: {query or 'Extract the requested fields'}\n\n"
            f"{docs}"
        )

    def _parse_rows(self, raw: str, documents: List[Dict[str, str]], fields: List[str]) -> List[Dict[str, Any]]:
        raw = (raw or "").strip()
        candidates: List[Any] = [raw]
        fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.DOTALL | re.IGNORECASE)
        if fenced:
            candidates.append(fenced.group(1).strip())
        first_object = raw.find("{")
        last_object = raw.rfind("}")
        if first_object != -1 and last_object > first_object:
            candidates.append(raw[first_object:last_object + 1])
        first_array = raw.find("[")
        last_array = raw.rfind("]")
        if first_array != -1 and last_array > first_array:
            candidates.append(raw[first_array:last_array + 1])
        candidates.extend(self._json_values_in_text(raw))

        for candidate in candidates:
            if not candidate:
                continue
            try:
                data = json.loads(candidate) if isinstance(candidate, str) else candidate
                rows = self._coerce_rows(data)
                if rows:
                    return rows
            except Exception:
                continue

        logger.error("provider.parse_failed raw_preview=%r", raw[:1000])
        raise ProviderError(
            "OpenCode did not return the required JSON rows. "
            "The final answer must be a JSON object shaped like "
            '{"rows":[{"Document Name":"file.pdf","Field":"Value"}]}.'
        )

    def _json_values_in_text(self, text: str) -> List[Any]:
        decoder = json.JSONDecoder()
        values: List[Any] = []
        for index, char in enumerate(text):
            if char not in "{[":
                continue
            try:
                value, _ = decoder.raw_decode(text[index:])
            except Exception:
                continue
            values.append(value)
        return values

    def _coerce_rows(self, data: Any) -> List[Dict[str, Any]]:
        if isinstance(data, dict):
            if isinstance(data.get("rows"), list):
                return [row for row in data["rows"] if isinstance(row, dict)]
            for key in ("data", "results", "structured_output", "output", "result", "content", "message", "info"):
                if key in data:
                    rows = self._coerce_rows(data[key])
                    if rows:
                        return rows
            return [data] if ("Document Name" in data or "file_name" in data) else []
        if isinstance(data, list):
            if all(isinstance(row, dict) for row in data):
                return data
            for item in data:
                rows = self._coerce_rows(item)
                if rows:
                    return rows
        if isinstance(data, str):
            for value in self._json_values_in_text(data):
                rows = self._coerce_rows(value)
                if rows:
                    return rows
        return []


class OpenCodeProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        logger.info(
            "provider.opencode.extract model=%s documents=%d fields=%s",
            self.settings.opencode_model or "default",
            len(documents),
            fields,
        )
        task_columns = self._task_columns(query)
        agent = "data-analysis" if task_columns else "data-extraction"
        raw = await asyncio.to_thread(self._run_opencode, documents, fields, query, agent)
        rows = self._normalize_row_values(self._parse_rows(raw, documents, fields))
        if task_columns and not self._rows_include_columns(rows, task_columns):
            logger.info(
                "provider.opencode.retry_task_columns query=%r required_columns=%s",
                query[:200],
                task_columns,
            )
            strict_query = self._strict_task_query(query, task_columns)
            strict_documents = [
                self._with_strict_analysis_context(document, strict_query)
                for document in documents
            ]
            raw = await asyncio.to_thread(self._run_opencode, strict_documents, task_columns, strict_query, "data-analysis")
            rows = self._normalize_row_values(self._parse_rows(raw, strict_documents, task_columns))
        return rows

    def _rows_include_columns(self, rows: List[Dict[str, Any]], columns: List[str]) -> bool:
        if not rows or not columns:
            return True
        normalized = {self._normalize_column(key) for row in rows for key in row.keys()}
        return all(self._normalize_column(column) in normalized for column in columns)

    def _normalize_column(self, value: str) -> str:
        return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()

    def _normalize_row_values(self, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        return [
            {
                key: self._format_scaled_money(value)
                for key, value in row.items()
            }
            for row in rows
        ]

    def _format_scaled_money(self, value: Any) -> Any:
        if not isinstance(value, str):
            return value
        text = value.strip()
        if len(text) > 80:
            return value
        match = re.fullmatch(r"\$?\s*([0-9][0-9,]*(?:\.\d+)?)\s*(?:M|m|million|millions)", text)
        if not match:
            return value
        number = float(match.group(1).replace(",", ""))
        if number >= 1000:
            billions = number / 1000
            return f"${billions:.1f}B" if billions < 100 else f"${billions:.0f}B"
        return f"${number:.0f}M" if number == int(number) else f"${number:.1f}M"

    def _run_opencode(self, documents: List[Dict[str, str]], fields: List[str], query: str, agent: str = "data-extraction") -> str:
        command = self._resolve_command()
        args = self._build_run_args(documents, fields, query, agent)
        logger.info(
            "provider.opencode.command agent=%s model=%s attachments=%d",
            agent,
            self.settings.opencode_model or "default",
            sum(1 for arg in args if arg == "--file"),
        )

        completed = self._run_command(command, args)
        if completed.returncode != 0:
            stderr = (completed.stderr or "").strip()
            stdout = (completed.stdout or "").strip()
            raise ProviderError(f"OpenCode extraction failed: {stderr or stdout or 'unknown error'}")
        stdout = completed.stdout or ""
        stderr = completed.stderr or ""
        raw_output = "\n".join(part for part in (stdout, stderr) if part.strip())
        clean_output = self._strip_ansi(raw_output)
        logger.info(
            "provider.opencode.complete stdout_chars=%d stderr_chars=%d",
            len(stdout),
            len(stderr),
        )
        if not raw_output.strip():
            raise ProviderError(
                "OpenCode completed without returning output. Check that the selected OpenCode model route is configured and authenticated."
            )
        self._raise_for_opencode_error(clean_output)
        return self._extract_opencode_result(raw_output)

    def _build_run_args(self, documents: List[Dict[str, str]], fields: List[str], query: str, agent: str = "data-extraction") -> List[str]:
        attach_paths = self._attachment_paths(documents, agent)
        task_columns = fields or self._task_columns(query)
        logger.info("provider.opencode.request query=%r fields=%s", query[:200], fields)
        file_manifest = "\n".join(
            f"- {doc.get('file_name')}: original={doc.get('path') or 'unavailable'} "
            f"text_index={doc.get('text_path') or 'unavailable'} "
            f"retrieved_context={doc.get('retrieval_context_path') or 'unavailable'} "
            f"embedding_index={doc.get('embedding_index_path') or 'unavailable'}"
            for doc in documents
        )
        message = (
            f"{OPENCODE_SYSTEM_PROMPT}\n\n"
            "Read the attached retrieved-context file first. If it is insufficient, inspect the attached full text index. "
            "The original uploaded file path is also provided in the manifest for local file access.\n\n"
            "Your final assistant message must contain only the JSON object. Do not describe your process. Do not include markdown.\n\n"
            f"User query: {query or 'Extract the relevant data from the attached documents.'}\n"
            f"Interpreted task guidance: {self._task_guidance(query)}\n"
            f"Required output columns for the latest task, if any: {task_columns}\n"
            "If required output columns are listed, return those columns plus Document Name and do not reuse old table columns.\n\n"
            f"Current table context:\n{self._table_context(documents)}\n\n"
            f"Conversation memory:\n{self._memory(documents)}\n\n"
            f"Attached local files:\n{file_manifest}\n"
        )

        task_path = self._write_task_file(message, agent)

        # OpenCode has both an array-valued --file option and a variadic message
        # positional. Keep the command-line message short on Windows and attach
        # the full task as a local file so large table context cannot exceed the
        # cmd.exe argument limit.
        args = ["run", "--agent", agent, "--format", "json"]
        if self.settings.opencode_model:
            args.extend(["--model", self.settings.opencode_model])
        args.extend(["--file", str(task_path)])
        for path in attach_paths:
            args.extend(["--file", str(path)])
        if self.settings.openai_reasoning_effort and self.settings.selected_opencode_api_provider() == "openai":
            args.extend(["--variant", self.settings.openai_reasoning_effort])
        args.extend([
            "--",
            (
                f"Read the attached OpenCode task file {task_path.name}. "
                "Follow it exactly and return only the required JSON object."
            ),
        ])
        return args

    def _write_task_file(self, message: str, agent: str) -> Path:
        root = Path(__file__).resolve().parents[1] / "storage" / "opencode_tasks"
        root.mkdir(parents=True, exist_ok=True)
        task_path = root / f"{agent}_{uuid.uuid4().hex}.txt"
        task_path.write_text(message, encoding="utf-8")
        return task_path.resolve()

    def _task_columns(self, query: str) -> List[str]:
        lowered = str(query or "").lower()
        if "risk" in lowered and ("score" in lowered or "scoring" in lowered):
            return ["Risk Score", "Risk Rationale"]
        if "deep research" in lowered:
            return ["Deep Research Summary"]
        if "summary" in lowered or "summarize" in lowered:
            return ["Summary"]
        if "analysis" in lowered:
            return ["Analysis"]
        return []

    def _strict_task_query(self, original_query: str, columns: List[str]) -> str:
        joined = ", ".join(columns)
        lowered = str(original_query or "").lower()
        if "deep research" in lowered:
            task = "Create a document-grounded deep research summary of the uploaded file."
        elif "summary" in lowered or "summarize" in lowered:
            task = "Create a document-grounded summary of the uploaded file."
        elif "risk" in lowered:
            task = "Create a document-grounded risk assessment of the uploaded file."
        else:
            task = "Create the requested document-grounded analysis of the uploaded file."
        return (
            f"{task}\n"
            f"Original user request: {original_query}\n"
            f"Return exactly these columns plus Document Name: {joined}.\n"
            "Do not extract or repeat a financial metrics table. Do not use prior table columns. "
            "The cell value should be a concise analyst-style answer supported by the attached local document."
        )

    def _task_guidance(self, query: str) -> str:
        lowered = str(query or "").lower()
        if any(term in lowered for term in ("summary", "summarize", "deep research", "research summary", "analysis", "risk", "score", "why", "reason")):
            return (
                "This is an analysis/synthesis request. Return fresh analysis columns that answer the latest query, "
                "such as Summary, Deep Research Summary, Risk Score, or Rationale when appropriate. "
                "Do not repeat existing financial columns unless the latest query explicitly asks to keep them. "
                "Do not return Not found simply because the requested phrase is not a source-table label."
            )
        if any(term in lowered for term in ("instead of", "replace", "rather than")):
            return (
                "This is a replacement/refinement request. Use table context to understand what is being replaced, "
                "then return only the newly requested output columns plus Document Name."
            )
        return "Infer the table columns from the latest user query and uploaded file content."

    def _resolve_command(self) -> str:
        configured = self.settings.opencode_command.strip() or "opencode"
        resolved = shutil.which(configured) or configured
        if configured == "opencode" and not shutil.which(configured):
            appdata = Path.home() / "AppData" / "Roaming" / "npm" / "opencode.cmd"
            if appdata.exists():
                resolved = str(appdata)
        return resolved

    def _run_command(self, command: str, args: List[str]) -> subprocess.CompletedProcess[str]:
        command_path = Path(command)
        if command_path.suffix.lower() in {".cmd", ".bat"}:
            full_command = ["cmd.exe", "/d", "/s", "/c", command, *args]
        else:
            full_command = [command, *args]
        return subprocess.run(
            full_command,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=self.settings.opencode_timeout_seconds,
            env=self._env(),
            cwd=Path(__file__).resolve().parents[1],
        )

    def _env(self) -> Dict[str, str]:
        env = dict(os.environ)
        gemini_key = (
            self.settings.google_generative_ai_api_key
            or self.settings.gemini_api_key
            or self.settings.google_api_key
        )
        configured_keys = {
            "OPENAI_API_KEY": self.settings.openai_api_key,
            "ANTHROPIC_API_KEY": self.settings.anthropic_api_key,
            "GEMINI_API_KEY": gemini_key,
            "GOOGLE_API_KEY": gemini_key,
            "GOOGLE_GENERATIVE_AI_API_KEY": gemini_key,
            "OPENROUTER_API_KEY": self.settings.openrouter_api_key,
        }
        for key, value in configured_keys.items():
            if value:
                env[key] = value
        if self.settings.opencode_browser_enabled:
            env["OPENCODE_ENABLE_EXA"] = "1"
        return env

    def _strip_ansi(self, text: str) -> str:
        return ANSI_RE.sub("", text or "").strip()

    def _raise_for_opencode_error(self, text: str) -> None:
        lower = text.lower()
        if "api key is missing" in lower:
            raise ProviderError(
                "OpenCode could not authenticate the selected model provider: API key is missing. "
                "For Gemini/OpenCode, set GOOGLE_GENERATIVE_AI_API_KEY, GEMINI_API_KEY, or GOOGLE_API_KEY, then restart."
            )
        if "was not found or your project does not have access" in lower:
            raise ProviderError(
                "OpenCode could not access the selected model route. Choose a model available to this API key/project, "
                f"for example google-vertex/gemini-2.5-pro for the Gemini Vertex route. Provider said: {text[:700]}"
            )
        if "error:" in lower and "rows" not in lower:
            raise ProviderError(f"OpenCode failed before returning extraction JSON: {text[:1000]}")

    def _memory(self, documents: List[Dict[str, str]]) -> str:
        memory = ""
        for doc in documents:
            if doc.get("memory"):
                memory = str(doc["memory"])
                break
        return memory[-8000:] if memory else "No prior conversation in this session."

    def _table_context(self, documents: List[Dict[str, str]]) -> str:
        for doc in documents:
            context = doc.get("table_context")
            if context:
                try:
                    return json.dumps(context, ensure_ascii=True)[:12000]
                except Exception:
                    return str(context)[:12000]
        return "No prior table context."

    def _extract_opencode_result(self, output: str) -> str:
        if not output.strip():
            return output

        parsed_objects = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                parsed_objects.append(json.loads(line))
            except Exception:
                continue

        if not parsed_objects:
            return output

        for obj in reversed(parsed_objects):
            rows_payload = self._find_rows_payload(obj)
            if rows_payload is not None:
                return json.dumps(rows_payload)

        texts: List[str] = []
        for obj in parsed_objects:
            self._collect_text(obj, texts)
        for text in reversed(texts):
            if "{" in text and "rows" in text:
                return text
        combined_text = "\n".join(texts)
        if "{" in combined_text and "rows" in combined_text:
            return combined_text
        return texts[-1] if texts else output

    def _find_rows_payload(self, value: Any) -> Any:
        if isinstance(value, dict):
            if isinstance(value.get("rows"), list):
                return value
            for key in ("structured_output", "output", "result", "content", "message", "data", "info"):
                if key in value:
                    found = self._find_rows_payload(value[key])
                    if found is not None:
                        return found
        elif isinstance(value, list):
            for item in value:
                found = self._find_rows_payload(item)
                if found is not None:
                    return found
        elif isinstance(value, str) and "rows" in value and "{" in value:
            try:
                parsed = json.loads(value)
                return self._find_rows_payload(parsed)
            except Exception:
                return None
        return None

    def _collect_text(self, value: Any, texts: List[str]) -> None:
        if isinstance(value, dict):
            for key in ("text", "content", "message", "output", "result"):
                item = value.get(key)
                if isinstance(item, str):
                    texts.append(item)
                elif item is not None:
                    self._collect_text(item, texts)
            for item in value.values():
                if isinstance(item, (dict, list)):
                    self._collect_text(item, texts)
        elif isinstance(value, list):
            for item in value:
                self._collect_text(item, texts)

    def _with_strict_analysis_context(self, document: Dict[str, str], query: str) -> Dict[str, str]:
        next_document = {**document, "table_context": {"columns": [], "rows": []}}
        index_path_value = document.get("embedding_index_path")
        if not index_path_value:
            return next_document
        index_path = Path(index_path_value)
        if not index_path.exists():
            return next_document
        try:
            local_index = LocalEmbeddingIndex(self.settings.local_embedding_dir.expanduser())
            chunks = local_index.retrieve(index_path, query, top_k=16)
            context_path = local_index.write_context_file(
                "strict-analysis",
                str(document.get("file_id") or index_path.stem),
                str(document.get("file_name") or "document"),
                str(document.get("path") or ""),
                str(document.get("text_path") or ""),
                query,
                chunks,
            )
            next_document["retrieval_context_path"] = str(context_path)
        except Exception:
            logger.exception("provider.opencode.strict_context_failed file=%s", document.get("file_name"))
        return next_document

    def _attachment_paths(self, documents: List[Dict[str, str]], agent: str = "data-extraction") -> List[Path]:
        paths: List[Path] = []
        for doc in documents:
            retrieval_context = doc.get("retrieval_context_path")
            retrieval_context_path = Path(retrieval_context) if retrieval_context else None
            if retrieval_context_path and retrieval_context_path.exists() and retrieval_context_path.resolve() not in paths:
                paths.append(retrieval_context_path.resolve())
                if agent == "data-analysis":
                    continue
            text_index = doc.get("text_path")
            text_path = Path(text_index) if text_index else None
            if text_path and text_path.exists() and text_path.resolve() not in paths:
                paths.append(text_path.resolve())
                if agent == "data-analysis":
                    continue
            raw_path = doc.get("path")
            if not raw_path:
                continue
            path = Path(raw_path)
            if path.exists() and path.resolve() not in paths:
                paths.append(path.resolve())
        if not paths:
            raise ProviderError("OpenCode provider needs at least one local file attachment.")
        return paths


def get_provider(settings: Settings) -> BaseProvider:
    return OpenCodeProvider(settings)
