"""Local storage and session state."""

from __future__ import annotations

import json
import logging
import re
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from .config import Settings

logger = logging.getLogger("data_extraction.storage")


class SessionStore:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.root = settings.local_storage_dir
        self.upload_root = self.root / "uploads"
        self.session_store = settings.session_store
        self.root.mkdir(parents=True, exist_ok=True)
        self.upload_root.mkdir(parents=True, exist_ok=True)
        self.session_store.parent.mkdir(parents=True, exist_ok=True)
        self.sessions: Dict[str, Dict[str, Any]] = self._load()

    def _load(self) -> Dict[str, Dict[str, Any]]:
        if not self.session_store.exists():
            return {}
        try:
            return json.loads(self.session_store.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def save(self) -> None:
        self.session_store.write_text(json.dumps(self.sessions, indent=2), encoding="utf-8")

    def get_or_create(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.sessions:
            self.sessions[session_id] = {
                "session_id": session_id,
                "created_at": datetime.utcnow().isoformat(),
                "uploaded_files": [],
                "table_data": {"columns": [], "rows": []},
            }
            self.save()
            logger.info("session_store.created session_id=%s session_store=%s", session_id, self.session_store)
        return self.sessions[session_id]

    def get(self, session_id: str) -> Optional[Dict[str, Any]]:
        return self.sessions.get(session_id)

    async def save_uploads(self, session_id: str, files: List[UploadFile]) -> List[Dict[str, Any]]:
        session = self.get_or_create(session_id)
        session_dir = self.upload_root / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        saved_files: List[Dict[str, Any]] = []
        for upload in files:
            file_id = str(uuid.uuid4())
            safe_name = Path(upload.filename or f"{file_id}.bin").name
            stored_name = f"{file_id}_{safe_name}"
            path = session_dir / stored_name
            with path.open("wb") as out_file:
                shutil.copyfileobj(upload.file, out_file)

            info = {
                "file_id": file_id,
                "filename": stored_name,
                "display_name": safe_name,
                "path": str(path),
                "size": path.stat().st_size,
                "upload_time": datetime.utcnow().isoformat(),
                "status": "indexed",
            }
            session["uploaded_files"].append(info)
            saved_files.append(info)
            logger.info(
                "file.saved session_id=%s display_name=%s size=%d path=%s",
                session_id,
                safe_name,
                info["size"],
                path,
            )

        self.save()
        return saved_files

    def get_files(self, session_id: str) -> List[Dict[str, Any]]:
        session = self.get_or_create(session_id)
        return session.get("uploaded_files", [])

    def find_file(self, session_id: str, filename: str) -> Optional[Path]:
        for file_info in self.get_files(session_id):
            candidates = [
                Path(file_info.get("path", "")),
                self.upload_root / session_id / file_info.get("filename", ""),
                self.upload_root / session_id / filename,
            ]
            for candidate in candidates:
                if candidate.exists() and (candidate.name == filename or candidate.name.endswith(filename)):
                    return candidate
        return None

    def find_file_by_name(self, filename: str) -> Optional[Path]:
        for session in self.sessions.values():
            for file_info in session.get("uploaded_files", []):
                path = Path(file_info.get("path", ""))
                if path.exists() and (path.name == filename or path.name.endswith(filename)):
                    return path
        return None

    def table_state(self, session_id: str) -> Dict[str, Any]:
        session = self.get_or_create(session_id)
        return session.get("table_data", {"columns": [], "rows": []})

    def update_table_rows(self, session_id: str, rows: List[Dict[str, Any]]) -> None:
        session = self.get_or_create(session_id)
        columns = [{"id": "Document Name", "label": "Document Name", "dataType": "file"}]
        for row in rows:
            for key in row.keys():
                if key != "Document Name" and not any(col["label"] == key for col in columns):
                    columns.append({"id": key, "label": key, "dataType": "text"})
        session["table_data"] = {"columns": columns, "rows": rows}
        self.save()

    def extract_texts(self, session_id: str, query: str = "", fields: Optional[List[str]] = None) -> List[Dict[str, str]]:
        documents: List[Dict[str, str]] = []
        for file_info in self.get_files(session_id):
            path = Path(file_info.get("path", ""))
            text = ""
            if path.suffix.lower() == ".pdf":
                text = self._read_pdf(path)
            else:
                text = self._read_text(path)
            selected_text = self._select_relevant_text(text, query=query, fields=fields or [])
            documents.append({
                "file_id": file_info["file_id"],
                "file_name": file_info["display_name"],
                "text": selected_text,
            })
            logger.info(
                "file.text_extracted session_id=%s file_name=%s chars=%d selected_chars=%d",
                session_id,
                file_info["display_name"],
                len(text),
                len(selected_text),
            )
        return documents

    def _select_relevant_text(self, text: str, query: str = "", fields: Optional[List[str]] = None) -> str:
        if not text:
            return ""

        terms = set(re.findall(r"[A-Za-z][A-Za-z ]{2,}", query or ""))
        for field in fields or []:
            terms.add(field)

        financial_terms = [
            "total revenues",
            "revenues",
            "revenue",
            "net income",
            "operating income",
            "gross profit",
            "cash and cash equivalents",
            "total assets",
            "total liabilities",
            "stockholders' equity",
            "shareholders equity",
            "consolidated statements of operations",
            "consolidated balance sheets",
            "consolidated statements of cash flows",
            "cash flows",
            "capital expenditures",
        ]
        lower_query = (query or "").lower()
        if "financial" in lower_query or "10-k" in lower_query or "10k" in lower_query:
            terms.update(financial_terms)
        for field in fields or []:
            normalized = field.lower()
            if any(word in normalized for word in ["revenue", "income", "asset", "liabil", "cash", "equity", "ebitda", "profit"]):
                terms.update(financial_terms)

        chunks = [text[:5000]]
        lower_text = text.lower()
        seen_ranges = set()
        for term in sorted({term.lower().strip() for term in terms if term and len(term.strip()) > 2}):
            start = 0
            hits = 0
            while hits < 4:
                index = lower_text.find(term, start)
                if index == -1:
                    break
                window_start = max(index - 2500, 0)
                window_end = min(index + 4500, len(text))
                range_key = (window_start // 1000, window_end // 1000)
                if range_key not in seen_ranges:
                    chunks.append(f"\n\n--- Relevant excerpt for '{term}' ---\n{text[window_start:window_end]}")
                    seen_ranges.add(range_key)
                start = index + len(term)
                hits += 1
                if sum(len(chunk) for chunk in chunks) > 70000:
                    break
            if sum(len(chunk) for chunk in chunks) > 70000:
                break

        selected = "\n".join(chunks)
        return selected[:80000]

    def _read_text(self, path: Path) -> str:
        try:
            return path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""

    def _read_pdf(self, path: Path) -> str:
        try:
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            return ""
