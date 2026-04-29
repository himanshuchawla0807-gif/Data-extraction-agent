"""FastAPI router for the data extraction workflow."""

from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse

from .config import Settings, get_settings
from .extraction_graph import run_extraction_workflow
from .model_catalog import provider_catalog
from .models import ExtractionRequest, ExtractionResponse
from .storage import SessionStore

router = APIRouter()
connections: Dict[str, WebSocket] = {}
stores: Dict[str, SessionStore] = {}


def get_store(settings: Settings = Depends(get_settings)) -> SessionStore:
    key = str(settings.session_store.resolve())
    if key not in stores:
        stores[key] = SessionStore(settings)
    return stores[key]


async def send_ws(session_id: str, payload: Dict[str, Any]) -> None:
    websocket = connections.get(session_id)
    if websocket:
        await websocket.send_json(payload)


@router.get("/health")
async def health(settings: Settings = Depends(get_settings)) -> Dict[str, Any]:
    return {
        "service": "data-extraction-agent-open",
        "status": "ok",
        "provider": settings.data_extraction_provider,
        "model": settings.effective_model(),
        "reasoning_effort": settings.openai_reasoning_effort if settings.data_extraction_provider == "openai" else None,
        "provider_key_available": settings.provider_key_available(),
        "timestamp": datetime.now(UTC).isoformat(),
    }


@router.get("/providers")
async def providers() -> Dict[str, Any]:
    return provider_catalog()


@router.post("/data-extraction/generate-title")
async def generate_title(payload: Dict[str, Any]) -> Dict[str, Any]:
    raw_text = (
        payload.get("message")
        or payload.get("query")
        or payload.get("content")
        or payload.get("title")
        or "Data Extraction Session"
    )
    if isinstance(payload.get("messages"), list) and payload["messages"]:
        raw_text = payload["messages"][-1].get("content") or raw_text
    title = " ".join(str(raw_text).strip().split())[:80] or "Data Extraction Session"
    return {"success": True, "title": title}


@router.post("/sessions")
async def create_local_session(payload: Dict[str, Any], store: SessionStore = Depends(get_store)) -> Dict[str, Any]:
    session_id = payload.get("sessionId") or payload.get("session_id") or f"session_{uuid.uuid4().hex[:8]}"
    session = store.get_or_create(session_id)
    session["title"] = payload.get("title") or session.get("title") or "Data Extraction Session"
    session["user_id"] = payload.get("userId") or payload.get("user_id") or "local"
    session["agent_type"] = payload.get("agentType") or "data_extraction"
    store.save()
    return {"success": True, "session": session, "sessionId": session_id}


@router.get("/sessions/{user_id}/{session_id}")
async def get_local_session(user_id: str, session_id: str, store: SessionStore = Depends(get_store)) -> Dict[str, Any]:
    session = store.get_or_create(session_id)
    return {"success": True, "session": session}


@router.post("/sessions/{user_id}/{session_id}/messages")
async def save_local_message(
    user_id: str,
    session_id: str,
    payload: Dict[str, Any],
    store: SessionStore = Depends(get_store),
) -> Dict[str, Any]:
    session = store.get_or_create(session_id)
    session.setdefault("messages", []).append({
        "role": payload.get("role", "user"),
        "content": payload.get("content", ""),
        "created_at": datetime.utcnow().isoformat(),
    })
    store.save()
    return {"success": True, "messageCount": len(session["messages"])}


@router.post("/sessions/{user_id}/{session_id}/table")
async def save_local_table(
    user_id: str,
    session_id: str,
    payload: Dict[str, Any],
    store: SessionStore = Depends(get_store),
) -> Dict[str, Any]:
    rows = payload.get("data") or payload.get("rows") or []
    columns = payload.get("columns") or []
    session = store.get_or_create(session_id)
    session["table_data"] = {"columns": columns, "rows": rows}
    session["chat_title"] = payload.get("chatTitle") or session.get("chat_title")
    store.save()
    return {"success": True, "columnCount": len(columns), "rowCount": len(rows)}


@router.get("/data-extraction/health")
async def data_extraction_health(settings: Settings = Depends(get_settings)) -> Dict[str, Any]:
    return await health(settings)


@router.get("/data-extraction/session/{session_id}/files")
async def get_session_files(session_id: str, store: SessionStore = Depends(get_store)) -> Dict[str, Any]:
    files = store.get_files(session_id)
    return {"success": True, "files": files, "count": len(files)}


@router.get("/data-extraction/session/{session_id}/table-state")
async def get_table_state(session_id: str, store: SessionStore = Depends(get_store)) -> Dict[str, Any]:
    return {"success": True, "session_id": session_id, "table_data": store.table_state(session_id)}


@router.post("/data-extraction/upload")
async def upload_files(
    session_id: str = Form(...),
    files: List[UploadFile] = File(...),
    store: SessionStore = Depends(get_store),
) -> Dict[str, Any]:
    uploaded = await store.save_uploads(session_id, files)
    await send_ws(session_id, {
        "type": "files_stored",
        "message": f"{len(uploaded)} file(s) stored locally.",
        "files": uploaded,
        "total_files": len(uploaded),
    })
    await send_ws(session_id, {
        "type": "upload_complete",
        "message": f"{len(uploaded)} file(s) uploaded.",
        "files": uploaded,
        "files_count": len(uploaded),
    })
    await send_ws(session_id, {
        "type": "indexing_complete",
        "message": "Files are ready for extraction.",
        "files_count": len(uploaded),
    })
    return {
        "success": True,
        "session_id": session_id,
        "uploaded_files": uploaded,
        "message": "Files uploaded and indexed locally.",
    }


@router.post("/data-extraction/extract", response_model=ExtractionResponse)
async def extract_data(
    request: ExtractionRequest,
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_store),
) -> ExtractionResponse:
    session_id = request.document_ids[0] if request.document_ids else f"session_{uuid.uuid4().hex[:8]}"
    rows = await run_extraction_workflow(
        settings,
        store.extract_texts(session_id),
        request.fields,
        request.query or request.context or "",
    )
    store.update_table_rows(session_id, rows)
    return ExtractionResponse(
        extraction_id=str(uuid.uuid4()),
        extracted_fields={"rows": rows},
        confidence_score=0.8 if settings.data_extraction_provider != "mock" else 0.65,
    )


@router.get("/data-extraction/view-pdf")
async def view_pdf(filename: str, store: SessionStore = Depends(get_store)) -> FileResponse:
    path = store.find_file_by_name(filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


@router.get("/data-extraction/files/{session_id}/{filename:path}")
async def serve_file(session_id: str, filename: str, store: SessionStore = Depends(get_store)) -> FileResponse:
    path = store.find_file(session_id, filename)
    if not path:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


async def run_and_stream_extraction(
    session_id: str,
    fields: List[str],
    query: str,
    settings: Settings,
    store: SessionStore,
) -> None:
    fields = [field for field in fields if field and field != "Document Name"]
    if not fields:
        fields = ["Summary"]

    await send_ws(session_id, {"type": "extraction_progress", "status": "started", "message": "Starting extraction"})
    for index, field in enumerate(fields, start=1):
        await send_ws(session_id, {
            "type": "create_column",
            "column_name": field,
            "column_type": "text",
            "column_index": index,
        })

    documents = store.extract_texts(session_id)
    try:
        rows = await run_extraction_workflow(settings, documents, fields, query)
        store.update_table_rows(session_id, rows)
    except Exception as exc:
        await send_ws(session_id, {
            "type": "error",
            "message": str(exc),
            "provider": settings.data_extraction_provider,
            "model": settings.effective_model(),
        })
        await send_ws(session_id, {
            "type": "extraction_complete",
            "message": "Extraction failed.",
            "rows": [],
            "fields": fields,
            "error": str(exc),
        })
        return

    for row_index, row in enumerate(rows):
        file_name = row.get("Document Name", f"Document {row_index + 1}")
        for field in fields:
            await asyncio.sleep(0.05)
            await send_ws(session_id, {
                "type": "streamRowData",
                "data": {
                    "row_index": row_index,
                    "column_name": field,
                    "extracted_value": row.get(field, "Not found"),
                    "file_name": file_name,
                    "badge": "Mock" if settings.data_extraction_provider == "mock" else settings.data_extraction_provider,
                    "citations": [{"source": file_name, "excerpt": str(row.get(field, ""))[:180]}],
                    "reasoning": "Generated by the configured provider router.",
                    "is_placeholder": False,
                },
            })

    await send_ws(session_id, {
        "type": "extraction_query_response",
        "message": f"Extracted {len(fields)} field(s) from {len(rows)} file(s).",
        "extracted_fields": fields,
        "provider": settings.data_extraction_provider,
    })
    await send_ws(session_id, {
        "type": "extraction_complete",
        "message": "Extraction complete.",
        "rows": rows,
        "fields": fields,
    })


@router.websocket("/ws/{session_id}")
@router.websocket("/data-extraction/ws/{session_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    session_id: str,
    settings: Settings = Depends(get_settings),
    store: SessionStore = Depends(get_store),
) -> None:
    await websocket.accept()
    connections[session_id] = websocket
    await websocket.send_json({
        "type": "connection_established",
        "session_id": session_id,
        "message": "Connected to Data Extraction Agent Open.",
    })
    try:
        existing = store.get_files(session_id)
        if existing:
            await websocket.send_json({"type": "upload_complete", "files": existing, "files_count": len(existing)})
            await websocket.send_json({"type": "indexing_complete", "files_count": len(existing)})

        while True:
            data = await websocket.receive_json()
            message_type = data.get("type")
            if message_type == "ping":
                await websocket.send_json({"type": "pong", "timestamp": datetime.utcnow().isoformat()})
            elif message_type in {"start_extraction", "extraction_query", "column_query", "refine_column"}:
                fields = data.get("fields") or data.get("columns") or []
                if not fields and data.get("query"):
                    fields = [data["query"].replace("Extract", "").strip() or "Summary"]
                asyncio.create_task(run_and_stream_extraction(
                    session_id=session_id,
                    fields=fields,
                    query=data.get("query") or data.get("message") or "",
                    settings=settings,
                    store=store,
                ))
            elif message_type == "get_status":
                await websocket.send_json({"type": "status_update", "status": "ready"})
            else:
                await websocket.send_json({"type": "debug", "message": f"Unhandled message type: {message_type}"})
    except WebSocketDisconnect:
        connections.pop(session_id, None)
    except Exception as exc:
        connections.pop(session_id, None)
        try:
            await websocket.send_json({"type": "error", "message": str(exc)})
        except Exception:
            pass
