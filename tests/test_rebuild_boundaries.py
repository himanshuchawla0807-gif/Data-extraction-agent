import asyncio
import io
import json
from pathlib import Path

import pytest
from fastapi import HTTPException, UploadFile

from backend.auth import principal_id
from backend.config import Settings
from backend.foundation import RevisionConflict, SessionRepository, contained_path, validate_identifier
from backend.gemini_provider import verify_payload
from backend.providers import ProviderError
from backend.storage import SessionStore


def test_repository_preserves_many_sessions_and_detects_stale_writes(tmp_path):
    first = SessionRepository(tmp_path / "sessions.sqlite3")
    for index in range(12):
        first.write(f"session-{index}", {"created_at": "2020-01-01", "value": index})
    second = SessionRepository(tmp_path / "sessions.sqlite3")
    records, revisions = second.load()
    assert len(records) == 12
    first.write("session-0", {"value": 42}, revisions["session-0"])
    with pytest.raises(RevisionConflict):
        second.write("session-0", {"value": 99}, revisions["session-0"])
    assert first.load()[0]["session-0"]["value"] == 42


def test_legacy_json_is_preserved(tmp_path):
    legacy = tmp_path / "sessions.json"
    legacy.write_text(json.dumps({"session-a": {"value": "original"}}))
    repository = SessionRepository(tmp_path / "sessions.sqlite3")
    repository.migrate_json(legacy)
    repository.write("session-a", {"value": "updated"}, 1)
    repository.migrate_json(legacy)
    assert repository.load()[0]["session-a"]["value"] == "updated"
    assert json.loads(legacy.read_text())["session-a"]["value"] == "original"


@pytest.mark.parametrize("identifier", ["../other", "a/b", "a\\b", "", "x" * 129])
def test_invalid_session_identifier(identifier):
    with pytest.raises(ValueError):
        validate_identifier(identifier)


def test_containment_rejects_sibling_prefix(tmp_path):
    with pytest.raises(ValueError):
        contained_path(tmp_path / "uploads", "../uploads-other/file.txt")


def test_source_verification_abstains_for_fabricated_quote_wrong_page_and_value():
    documents = [{"file_id": "doc-1", "file_name": "report.txt", "text": "Revenue 120 USD", "pages": [{"page_number": 1, "text": "Revenue 120 USD"}]}]
    payload = {"rows": [{"document_id": "doc-1", "cells": [
        {"field": "Revenue", "value": "120", "quote": "Revenue 120 USD", "page_number": 1},
        {"field": "Profit", "value": "100", "quote": "Profit 100 USD", "page_number": 1},
        {"field": "Other", "value": "999", "quote": "Revenue 120 USD", "page_number": 1},
        {"field": "Wrong page", "value": "120", "quote": "Revenue 120 USD", "page_number": 2},
        {"field": "Partial number", "value": "12", "quote": "Revenue 120 USD", "page_number": 1},
    ]}]}
    rows = verify_payload(payload, documents, [])
    assert rows[0]["Revenue"] == "120"
    assert rows[0]["Profit"] == rows[0]["Other"] == rows[0]["Wrong page"] == "Not found"
    assert rows[0]["Partial number"] == "Not found"
    assert list(rows[0]["__evidence__"]) == ["Revenue"]


def test_source_verification_rejects_unknown_and_duplicate_documents():
    documents = [{"file_id": "doc-1", "file_name": "a.txt", "text": "a"}]
    with pytest.raises(ProviderError):
        verify_payload({"rows": [{"document_id": "evil", "cells": []}]}, documents, [])
    with pytest.raises(ProviderError):
        verify_payload({"rows": [{"document_id": "doc-1", "cells": []}] * 2}, documents, [])


def test_upload_stream_limits_ownership_and_duplicate_names(tmp_path):
    settings = Settings(local_storage_dir=tmp_path / "storage", session_store=tmp_path / "sessions.json", local_embedding_dir=tmp_path / "embeddings", max_upload_mb=1)
    store = SessionStore(settings)
    token = principal_id.set("alice")
    try:
        files = [UploadFile(filename="same.txt", file=io.BytesIO(b"first")), UploadFile(filename="same.txt", file=io.BytesIO(b"second"))]
        uploaded = asyncio.run(store.save_uploads("session-a", files))
        assert len({record["path"] for record in uploaded}) == 2
        assert {Path(record["path"]).read_text() for record in uploaded} == {"first", "second"}
        assert all(record["status"] == "uploaded" for record in uploaded)
        with pytest.raises(HTTPException) as error:
            asyncio.run(store.save_uploads("session-a", [UploadFile(filename="large.txt", file=io.BytesIO(b"x" * (1024 * 1024 + 1)))]))
        assert error.value.status_code == 413
        assert len(list((tmp_path / "storage" / "uploads" / "session-a").iterdir())) == 2
        principal_id.set("bob")
        with pytest.raises(HTTPException) as error:
            store.get_files("session-a")
        assert error.value.status_code == 403
        assert store.find_file_by_name("same.txt") is None
    finally:
        principal_id.reset(token)
