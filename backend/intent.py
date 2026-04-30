"""Intent helpers for turning natural-language requests into extraction fields."""

from __future__ import annotations

import re
from typing import List


FINANCIAL_FIELDS = [
    "Company Name",
    "Fiscal Year",
    "Revenue",
    "Gross Profit",
    "Operating Income",
    "Net Income",
    "EBITDA",
    "Cash and Cash Equivalents",
    "Total Assets",
    "Total Liabilities",
    "Shareholders Equity",
    "Operating Cash Flow",
    "Capital Expenditures",
    "Free Cash Flow",
]

DEFAULT_FIELDS = ["Summary", "Key Metrics", "Risks", "Source Page"]

STOP_PREFIXES = (
    "extract",
    "pull",
    "get",
    "find",
    "show",
    "list",
    "give me",
    "can you extract",
    "please extract",
)


def fields_from_query(query: str) -> List[str]:
    normalized = " ".join((query or "").strip().split())
    lower = normalized.lower()
    if not lower:
        return DEFAULT_FIELDS

    if any(token in lower for token in ("financial", "financials", "income statement", "balance sheet", "cash flow", "10-k", "10k")):
        return FINANCIAL_FIELDS

    for prefix in STOP_PREFIXES:
        if lower.startswith(prefix):
            normalized = normalized[len(prefix):].strip()
            lower = normalized.lower()
            break

    normalized = re.sub(r"\b(from|for|in|of)\s+(the\s+)?(file|files|document|documents|pdf|pdfs)\b", "", normalized, flags=re.IGNORECASE)
    pieces = re.split(r",|;|\band\b|\n", normalized)
    fields = []
    for piece in pieces:
        field = " ".join(piece.strip(" .:-").split())
        if field and len(field) <= 80:
            fields.append(field[:1].upper() + field[1:])
    return fields or DEFAULT_FIELDS
