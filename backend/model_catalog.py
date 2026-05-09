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
        {"label": "GPT-5.4 - Medium", "model": "openai/gpt-5.4", "reasoning_effort": "medium"},
        {"label": "GPT-5.4 Mini - Medium", "model": "openai/gpt-5.4-mini", "reasoning_effort": "medium"},
        {"label": "GPT-5.4 Nano - Low", "model": "openai/gpt-5.4-nano", "reasoning_effort": "low"},
        {
            "label": "Custom OpenAI route",
            "model": "",
            "custom": True,
            "placeholder": "openai/<model-name>",
        },
    ],
    "anthropic": [
        {"label": "Claude Opus 4.7", "model": "anthropic/claude-opus-4-7"},
        {"label": "Claude Sonnet 4.6", "model": "anthropic/claude-sonnet-4-6"},
        {"label": "Claude Haiku 4.5", "model": "anthropic/claude-haiku-4-5-20251001"},
        {
            "label": "Custom Anthropic route",
            "model": "",
            "custom": True,
            "placeholder": "anthropic/<model-name>",
        },
    ],
    "gemini": [
        {"label": "Gemini 3 Pro Preview", "model": "google-vertex/gemini-3-pro-preview"},
        {"label": "Gemini 3 Flash Preview", "model": "google-vertex/gemini-3-flash-preview"},
        {"label": "Gemini 2.5 Pro", "model": "google-vertex/gemini-2.5-pro"},
        {"label": "Gemini 2.5 Flash", "model": "google-vertex/gemini-2.5-flash"},
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
