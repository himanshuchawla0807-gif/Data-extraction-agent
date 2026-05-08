"""Provider and model choices exposed by the local launcher/API."""

from __future__ import annotations

from typing import Any, Dict, List


PROVIDER_ORDER = ["anthropic", "gemini", "openai", "openrouter", "custom"]

MODEL_PRESETS: Dict[str, List[Dict[str, Any]]] = {
    "openai": [
        {"label": "GPT-5.5 - X-High", "model": "openai/gpt-5.5", "reasoning_effort": "xhigh"},
        {"label": "GPT-5.5 - High", "model": "openai/gpt-5.5", "reasoning_effort": "high"},
        {"label": "GPT-5.5 - Medium", "model": "openai/gpt-5.5", "reasoning_effort": "medium"},
        {"label": "GPT-5.5 - Low", "model": "openai/gpt-5.5", "reasoning_effort": "low"},
        {"label": "GPT-5.5 Pro - X-High", "model": "openai/gpt-5.5-pro", "reasoning_effort": "xhigh"},
        {"label": "GPT-5.5 Pro - Medium", "model": "openai/gpt-5.5-pro", "reasoning_effort": "medium"},
    ],
    "anthropic": [
        {"label": "Claude Sonnet 4", "model": "anthropic/claude-sonnet-4-20250514"},
        {"label": "Claude Sonnet 4.5", "model": "anthropic/claude-sonnet-4-5-20250929"},
        {"label": "Claude Opus 4.5", "model": "anthropic/claude-opus-4-5-20251101"},
        {
            "label": "Custom Anthropic route",
            "model": "",
            "custom": True,
            "placeholder": "anthropic/<model-name>",
        },
    ],
    "gemini": [
        {"label": "Gemini 2.5 Pro", "model": "google-vertex/gemini-2.5-pro"},
        {"label": "Gemini 2.5 Flash", "model": "google-vertex/gemini-2.5-flash"},
        {"label": "Gemini 3 Pro Preview (Vertex access required)", "model": "google-vertex/gemini-3-pro-preview"},
        {"label": "Gemini 3.1 Pro Preview (Vertex access required)", "model": "google-vertex/gemini-3.1-pro-preview"},
        {"label": "Gemini 3 Flash Preview (Vertex access required)", "model": "google-vertex/gemini-3-flash-preview"},
        {
            "label": "Custom Gemini route",
            "model": "",
            "custom": True,
            "placeholder": "google-vertex/<gemini-model-name>",
        },
    ],
    "openrouter": [
        {
            "label": "Custom OpenRouter model",
            "model": "",
            "custom": True,
            "placeholder": "openrouter/<provider>/<model>",
        },
    ],
    "custom": [
        {
            "label": "Custom OpenCode model route",
            "model": "",
            "custom": True,
            "placeholder": "provider/model",
        },
    ],
}


def provider_catalog() -> Dict[str, Any]:
    return {
        "engine": "opencode",
        "providers": PROVIDER_ORDER,
        "default": "anthropic",
        "models": MODEL_PRESETS,
    }
