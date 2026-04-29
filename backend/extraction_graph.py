"""LangGraph-backed extraction workflow with a plain async fallback."""

from __future__ import annotations

from typing import Any, Dict, List, TypedDict

from .config import Settings
from .providers import get_provider


class ExtractionState(TypedDict, total=False):
    documents: List[Dict[str, str]]
    fields: List[str]
    query: str
    rows: List[Dict[str, Any]]
    verified: bool


async def run_extraction_workflow(
    settings: Settings,
    documents: List[Dict[str, str]],
    fields: List[str],
    query: str = "",
) -> List[Dict[str, Any]]:
    fields = [field for field in fields if field and field != "Document Name"]
    if not fields:
        fields = ["Summary"]

    provider = get_provider(settings)

    async def extract_node(state: ExtractionState) -> ExtractionState:
        rows = await provider.extract(state["documents"], state["fields"], state.get("query", ""))
        return {**state, "rows": rows}

    async def verify_node(state: ExtractionState) -> ExtractionState:
        normalized_rows = []
        for row in state.get("rows", []):
            next_row = {"Document Name": row.get("Document Name") or row.get("file_name") or "Document"}
            for field in state["fields"]:
                value = row.get(field)
                next_row[field] = value if value not in (None, "") else "Not found"
            normalized_rows.append(next_row)
        return {**state, "rows": normalized_rows, "verified": True}

    try:
        from langgraph.graph import END, StateGraph
    except Exception:
        state = await extract_node({"documents": documents, "fields": fields, "query": query})
        verified = await verify_node(state)
        return verified.get("rows", [])

    graph = StateGraph(ExtractionState)
    graph.add_node("extract", extract_node)
    graph.add_node("verify", verify_node)
    graph.set_entry_point("extract")
    graph.add_edge("extract", "verify")
    graph.add_edge("verify", END)
    app = graph.compile()
    result = await app.ainvoke({"documents": documents, "fields": fields, "query": query})
    return result.get("rows", [])
