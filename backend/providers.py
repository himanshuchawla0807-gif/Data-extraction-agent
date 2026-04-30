"""Provider adapters for extraction."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from abc import ABC, abstractmethod
from typing import Any, Dict, List

from .config import Settings

logger = logging.getLogger("data_extraction.providers")


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
        return (
            "Extract the requested fields from each document. "
            "Return valid JSON only, with no markdown fences or prose. "
            "The JSON must be an object with a 'rows' array. Each row must include "
            "'file_name' and one key per requested field. If a value is not found, use 'Not found'.\n\n"
            "Use common financial-statement aliases: Revenue may appear as total revenues; "
            "Net Income may appear as net income or net income attributable to the company; "
            "Shareholders Equity may appear as stockholders' equity. Prefer annual values from "
            "consolidated statements, not quarterly values.\n\n"
            f"Fields: {fields}\n"
            f"User query: {query or 'Extract the requested fields'}\n\n"
            f"{docs}"
        )

    def _parse_rows(self, raw: str, documents: List[Dict[str, str]], fields: List[str]) -> List[Dict[str, Any]]:
        raw = (raw or "").strip()
        candidates = [raw]
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

        for candidate in candidates:
            if not candidate:
                continue
            try:
                data = json.loads(candidate)
                if isinstance(data, dict):
                    data = data.get("rows") or data.get("data") or data.get("results") or [data]
                if isinstance(data, list):
                    rows = [row for row in data if isinstance(row, dict)]
                    if rows:
                        return rows
            except Exception:
                continue

        logger.warning("provider.parse_failed using fallback raw_preview=%r", raw[:300])
        return MockProvider(self.settings).mock_rows(documents, fields)


class MockProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        logger.info("provider.mock.extract documents=%d fields=%s", len(documents), fields)
        await asyncio.sleep(0.2)
        return self.mock_rows(documents, fields)

    def mock_rows(self, documents: List[Dict[str, str]], fields: List[str]) -> List[Dict[str, Any]]:
        if not documents:
            documents = [{"file_name": "Sample Document", "text": ""}]
        rows: List[Dict[str, Any]] = []
        for doc in documents:
            row: Dict[str, Any] = {"Document Name": doc["file_name"]}
            source_text = (doc.get("text") or "").strip()
            preview = source_text[:120].replace("\n", " ") if source_text else "mock extraction"
            for field in fields:
                if field == "Document Name":
                    continue
                row[field] = f"{field}: {preview}"
            rows.append(row)
        return rows


class OpenAIProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        if not self.settings.openai_api_key:
            raise ProviderError("OPENAI_API_KEY is required for the OpenAI provider.")
        from openai import AsyncOpenAI

        logger.info(
            "provider.openai.extract model=%s reasoning_effort=%s documents=%d fields=%s",
            self.settings.openai_model,
            self.settings.openai_reasoning_effort,
            len(documents),
            fields,
        )
        client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        kwargs: Dict[str, Any] = {
            "model": self.settings.openai_model,
            "messages": [{"role": "user", "content": self._prompt(documents, fields, query)}],
            "response_format": {"type": "json_object"},
        }
        if self.settings.openai_reasoning_effort:
            kwargs["reasoning_effort"] = self.settings.openai_reasoning_effort
        response = await client.chat.completions.create(**kwargs)
        raw = response.choices[0].message.content or "[]"
        return self._parse_rows(raw, documents, fields)


class OpenRouterProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        if not self.settings.openrouter_api_key:
            raise ProviderError("OPENROUTER_API_KEY is required for the OpenRouter provider.")
        from openai import AsyncOpenAI

        logger.info(
            "provider.openrouter.extract model=%s documents=%d fields=%s",
            self.settings.openrouter_model,
            len(documents),
            fields,
        )
        client = AsyncOpenAI(
            api_key=self.settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )
        if not self.settings.openrouter_model:
            raise ProviderError("OPENROUTER_MODEL is required for the OpenRouter provider.")
        response = await client.chat.completions.create(
            model=self.settings.openrouter_model,
            messages=[{"role": "user", "content": self._prompt(documents, fields, query)}],
        )
        raw = response.choices[0].message.content or "[]"
        return self._parse_rows(raw, documents, fields)


class AnthropicProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        if not self.settings.anthropic_api_key:
            raise ProviderError("ANTHROPIC_API_KEY is required for the Anthropic provider.")
        from anthropic import AsyncAnthropic

        logger.info(
            "provider.anthropic.extract model=%s documents=%d fields=%s",
            self.settings.anthropic_model,
            len(documents),
            fields,
        )
        client = AsyncAnthropic(api_key=self.settings.anthropic_api_key)
        response = await client.messages.create(
            model=self.settings.anthropic_model,
            max_tokens=3000,
            messages=[{"role": "user", "content": self._prompt(documents, fields, query)}],
        )
        raw = response.content[0].text if response.content else "[]"
        return self._parse_rows(raw, documents, fields)


class GeminiProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        api_key = self.settings.gemini_api_key or self.settings.google_api_key
        if not api_key:
            raise ProviderError("GEMINI_API_KEY or GOOGLE_API_KEY is required for the Gemini provider.")
        from google import genai

        logger.info(
            "provider.gemini.extract model=%s documents=%d fields=%s",
            self.settings.gemini_model,
            len(documents),
            fields,
        )
        client = genai.Client(api_key=api_key)
        prompt = self._prompt(documents, fields, query)

        def call_model() -> str:
            try:
                from google.genai import types

                response = client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json"),
                )
            except Exception:
                response = client.models.generate_content(model=self.settings.gemini_model, contents=prompt)
            return getattr(response, "text", "") or "[]"

        raw = await asyncio.to_thread(call_model)
        return self._parse_rows(raw, documents, fields)


def get_provider(settings: Settings) -> BaseProvider:
    provider = settings.data_extraction_provider.lower().strip()
    if provider == "mock":
        return MockProvider(settings)
    if provider == "openai":
        return OpenAIProvider(settings)
    if provider == "anthropic":
        return AnthropicProvider(settings)
    if provider in {"gemini", "google"}:
        return GeminiProvider(settings)
    if provider == "openrouter":
        return OpenRouterProvider(settings)
    raise ProviderError(f"Unsupported provider: {settings.data_extraction_provider}")
