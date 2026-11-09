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


def test_extract_only_selected_documents_and_reject_unknown_ids(tmp_path):
    settings = Settings(
        local_storage_dir=tmp_path / "storage",
        session_store=tmp_path / "sessions.json",
        local_embedding_dir=tmp_path / "embeddings",
    )
    store = SessionStore(settings)
    token = principal_id.set("alice")
    try:
        first, second = asyncio.run(store.save_uploads("case", [
            UploadFile(filename="a.txt", file=io.BytesIO(b"first source")),
            UploadFile(filename="b.txt", file=io.BytesIO(b"second source")),
        ]))
        documents = store.extract_texts("case", document_ids=[second["file_id"], second["file_id"]])
        assert [document["text"] for document in documents] == ["second source"]
        with pytest.raises(HTTPException) as error:
            store.extract_texts("case", document_ids=[first["file_id"], "foreign-id"])
        assert error.value.status_code == 404
        assert len(store.extract_texts("case")) == 2
    finally:
        principal_id.reset(token)


def test_rejected_extraction_upload_batch_leaves_no_files_or_metadata(tmp_path):
    settings = Settings(
        local_storage_dir=tmp_path / "storage",
        session_store=tmp_path / "sessions.json",
        local_embedding_dir=tmp_path / "embeddings",
    )
    token = principal_id.set("alice")
    try:
        store = SessionStore(settings)
        with pytest.raises(HTTPException) as error:
            asyncio.run(store.save_uploads("case", [
                UploadFile(filename="valid.txt", file=io.BytesIO(b"valid")),
                UploadFile(filename="empty.txt", file=io.BytesIO()),
            ]))
        assert error.value.status_code == 422
        assert store.get_files("case") == SessionStore(settings).get_files("case") == []
        assert not list((settings.local_storage_dir / "uploads" / "case").iterdir())
    finally:
        principal_id.reset(token)


def test_http_extraction_does_not_pass_unselected_session_evidence(tmp_path, monkeypatch):
    from backend import api
    from backend.models import ExtractionRequest

    settings = Settings(
        local_storage_dir=tmp_path / "storage",
        session_store=tmp_path / "sessions.json",
        local_embedding_dir=tmp_path / "embeddings",
    )
    store = SessionStore(settings)
    token = principal_id.set("alice")

    async def extract(settings, documents, fields, query):
        assert [doc["text"] for doc in documents] == ["selected evidence"]
        assert documents[0]["memory"] == ""
        assert documents[0]["table_context"]["rows"] == []
        return []

    monkeypatch.setattr(api, "run_extraction_workflow", extract)
    try:
        chosen, _ = asyncio.run(store.save_uploads("case", [
            UploadFile(filename="chosen.txt", file=io.BytesIO(b"selected evidence")),
            UploadFile(filename="other.txt", file=io.BytesIO(b"unselected evidence")),
        ]))
        session = store.get_or_create("case")
        session["messages"] = [{"content": "unselected evidence"}]
        session["table_data"]["rows"] = [{"Document Name": "other.txt", "Revenue": "unselected evidence"}]
        store.save()
        asyncio.run(api.extract_data(ExtractionRequest(
            session_id="case", document_ids=[chosen["file_id"]]
        ), settings, store))
    finally:
        principal_id.reset(token)


def test_file_lookup_requires_an_exact_unambiguous_session_file(tmp_path):
    settings = Settings(
        local_storage_dir=tmp_path / "storage",
        session_store=tmp_path / "sessions.json",
        local_embedding_dir=tmp_path / "embeddings",
    )
    store = SessionStore(settings)
    token = principal_id.set("alice")
    try:
        files = asyncio.run(store.save_uploads("case", [
            UploadFile(filename="new-memo.txt", file=io.BytesIO(b"new")),
            UploadFile(filename="memo.txt", file=io.BytesIO(b"original")),
        ]))
        assert store.find_file("case", "memo.txt").read_bytes() == b"original"
        assert store.find_file("case", "emo.txt") is None
        assert store.find_file("case", files[0]["filename"]).read_bytes() == b"new"
        asyncio.run(store.save_uploads("other", [UploadFile(filename="memo.txt", file=io.BytesIO(b"other"))]))
        assert store.find_file_by_name("memo.txt") is None
    finally:
        principal_id.reset(token)


@pytest.mark.parametrize("value,quote,expected", [(0, "Errors: 0", "0"), ("   ", "Errors: 0", "Not found")])
def test_quote_verification_preserves_zero_but_rejects_blank_values(value, quote, expected):
    documents = [{"file_id": "report", "file_name": "report.txt", "text": "Errors: 0"}]
    payload = {"rows": [{"document_id": "report", "cells": [{"field": "Errors", "value": value, "quote": quote}]}]}
    row = verify_payload(payload, documents, ["Errors"])[0]
    assert row["Errors"] == expected
    assert ("Errors" in row["__evidence__"]) is (expected == "0")


@pytest.mark.parametrize("payload", [
    None, [], {}, {"rows": {}}, {"rows": [None]},
    {"rows": [{"document_id": [], "cells": []}]},
    {"rows": [{"document_id": "report", "cells": {}}]},
    {"rows": [{"document_id": "report", "cells": [None]}]},
])
def test_malformed_extraction_response_raises_provider_error(payload):
    documents = [{"file_id": "report", "file_name": "report.txt", "text": "Revenue 12"}]
    with pytest.raises(ProviderError):
        verify_payload(payload, documents, [])


@pytest.mark.parametrize("page,expected", [(True, "Not found"), (1.0, "Not found"), (1, "12")])
def test_pdf_evidence_requires_an_integer_page(page, expected):
    quote = "Revenue 12"
    documents = [{"file_id": "report", "file_name": "report.pdf", "text": quote,
                  "pages": [{"page_number": 1, "text": quote}]}]
    payload = {"rows": [{"document_id": "report", "cells": [
        {"field": "Revenue", "value": "12", "quote": quote, "page_number": page}
    ]}]}
    row = verify_payload(payload, documents, ["Revenue"])[0]
    assert row["Revenue"] == expected
    assert ("Revenue" in row["__evidence__"]) is (expected == "12")


def test_text_evidence_does_not_claim_a_page_number():
    quote = "Revenue 12"
    documents = [{"file_id": "report", "file_name": "report.txt", "text": quote}]
    payload = {"rows": [{"document_id": "report", "cells": [
        {"field": "Revenue", "value": "12", "quote": quote, "page_number": 7}
    ]}]}
    row = verify_payload(payload, documents, ["Revenue"])[0]
    assert row["Revenue"] == "12"
    assert row["__evidence__"]["Revenue"]["page_number"] is None
