"""Provider adapters for extraction."""

from __future__ import annotations

import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any, Dict, List

from .config import Settings


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
            "Return JSON only as an array of objects. Each object must include "
            "'file_name' and one key per requested field.\n\n"
            f"Fields: {fields}\n"
            f"User query: {query or 'Extract the requested fields'}\n\n"
            f"{docs}"
        )

    def _parse_rows(self, raw: str, documents: List[Dict[str, str]], fields: List[str]) -> List[Dict[str, Any]]:
        try:
            data = json.loads(raw)
            if isinstance(data, dict):
                data = data.get("rows") or data.get("data") or [data]
            if isinstance(data, list):
                return [row for row in data if isinstance(row, dict)]
        except Exception:
            pass
        return MockProvider(self.settings).mock_rows(documents, fields)


class MockProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
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

        client = AsyncOpenAI(api_key=self.settings.openai_api_key)
        response = await client.chat.completions.create(
            model=self.settings.openai_model,
            messages=[{"role": "user", "content": self._prompt(documents, fields, query)}],
            response_format={"type": "json_object"},
        )
        raw = response.choices[0].message.content or "[]"
        return self._parse_rows(raw, documents, fields)


class OpenRouterProvider(BaseProvider):
    async def extract(self, documents: List[Dict[str, str]], fields: List[str], query: str = "") -> List[Dict[str, Any]]:
        if not self.settings.openrouter_api_key:
            raise ProviderError("OPENROUTER_API_KEY is required for the OpenRouter provider.")
        from openai import AsyncOpenAI

        client = AsyncOpenAI(
            api_key=self.settings.openrouter_api_key,
            base_url="https://openrouter.ai/api/v1",
        )
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

        client = genai.Client(api_key=api_key)
        prompt = self._prompt(documents, fields, query)

        def call_model() -> str:
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

