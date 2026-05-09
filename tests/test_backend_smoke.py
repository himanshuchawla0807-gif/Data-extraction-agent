from fastapi.testclient import TestClient

from backend.config import Settings
from backend.main import app
from backend.model_catalog import provider_catalog


def test_health_reports_configured_provider():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "data-extraction-agent-open"
    assert payload["engine"] == "opencode"
    assert payload["provider"] == "opencode"
    assert isinstance(payload["provider_key_available"], bool)


def test_provider_catalog_exposes_only_real_providers():
    catalog = provider_catalog()
    blocked_provider = "mo" + "ck"
    assert catalog["engine"] == "opencode"
    assert catalog["default"] == "anthropic"
    assert "opencode" not in catalog["providers"]
    assert blocked_provider not in catalog["providers"]
    assert blocked_provider not in catalog["models"]


def test_provider_catalog_uses_current_model_presets():
    catalog = provider_catalog()
    models = catalog["models"]

    assert models["anthropic"][0]["model"] == "anthropic/claude-opus-4-7"
    assert models["anthropic"][1]["model"] == "anthropic/claude-sonnet-4-6"
    assert models["openai"][0]["model"] == "openai/gpt-5.5"
    assert any(preset["model"] == "openai/gpt-5.4-mini" for preset in models["openai"])
    assert models["gemini"][0]["model"] == "google-vertex/gemini-3-pro-preview"
    assert models["openrouter"][0]["custom"] is True


def test_workflow_preserves_provider_schema_for_latest_query(monkeypatch):
    import asyncio

    from backend import extraction_graph

    class Provider:
        async def extract(self, documents, fields, query=""):
            return [{
                "Document Name": documents[0]["file_name"],
                "Risk Score": "8/10",
                "Risk Rationale": "Customer concentration and margin pressure.",
            }]

    monkeypatch.setattr(extraction_graph, "get_provider", lambda settings: Provider())
    rows = asyncio.run(extraction_graph.run_extraction_workflow(
        Settings(data_extraction_provider="opencode"),
        [{"file_name": "Amazon-10k-2024.pdf", "text": "risk disclosure text"}],
        [],
        "Do a risk scoring on a scale of 1 to 10 of the given documents.",
    ))

    assert rows == [{
        "Document Name": "Amazon-10k-2024.pdf",
        "Risk Score": "8/10",
        "Risk Rationale": "Customer concentration and margin pressure.",
    }]


def test_runtime_provider_is_always_opencode():
    from backend.providers import OpenCodeProvider, get_provider

    settings = Settings(data_extraction_provider="gemini", opencode_model="google-vertex/gemini-2.5-pro")
    assert isinstance(get_provider(settings), OpenCodeProvider)
    assert settings.effective_model() == "google-vertex/gemini-2.5-pro"


def test_opencode_prompt_is_not_passed_as_file():
    import shutil
    import uuid
    from pathlib import Path

    from backend.providers import OpenCodeProvider

    tmp_path = Path(".tmp") / f"test-opencode-args-{uuid.uuid4().hex}"
    try:
        tmp_path.mkdir(parents=True, exist_ok=True)
        original = tmp_path / "sample.pdf"
        text_index = tmp_path / "sample.txt"
        original.write_bytes(b"%PDF")
        text_index.write_text("sample extracted text", encoding="utf-8")

        provider = OpenCodeProvider(Settings(opencode_model="google-vertex/gemini-2.5-pro"))
        args = provider._build_run_args(
            [{"file_name": "sample.pdf", "path": str(original), "text_path": str(text_index)}],
            [],
            "Extract the document.",
        )

        file_args = [args[index + 1] for index, arg in enumerate(args) if arg == "--file"]
        assert args[0] == "run"
        assert args[args.index("--agent") + 1] == "data-extraction"
        assert args.index("--agent") < args.index("--")
        assert args[args.index("--agent") + 1] == "data-extraction"
        assert str(text_index.resolve()) in file_args
        task_file = next(Path(path) for path in file_args if Path(path).name.startswith("data-extraction_"))
        assert task_file.exists()
        assert task_file.read_text(encoding="utf-8").startswith("You are OpenCode")
        assert args[-2] == "--"
        assert "OpenCode task file" in args[-1]
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_opencode_extracts_rows_from_event_text():
    from backend.providers import OpenCodeProvider

    provider = OpenCodeProvider(Settings())
    output = "\n".join([
        '{"type":"session.updated","info":{"id":"s1"}}',
        '{"type":"message.part.updated","part":{"type":"text","text":"{\\"rows\\":[{\\"Document Name\\":\\"Amazon.pdf\\",\\"Revenue\\":\\"$638B\\"}]}"}}',
    ])

    extracted = provider._extract_opencode_result(output)
    rows = provider._parse_rows(extracted, [{"file_name": "Amazon.pdf"}], [])
    assert rows == [{"Document Name": "Amazon.pdf", "Revenue": "$638B"}]


def test_opencode_parse_failure_raises_instead_of_agent_response():
    import pytest

    from backend.providers import OpenCodeProvider, ProviderError

    provider = OpenCodeProvider(Settings())
    with pytest.raises(ProviderError):
        provider._parse_rows("", [{"file_name": "Amazon.pdf"}], [])


def test_provider_normalizes_million_scaled_money_values():
    from backend.providers import OpenCodeProvider

    provider = OpenCodeProvider(Settings())
    rows = provider._normalize_row_values([{
        "Document Name": "Amazon.pdf",
        "Revenue": "$637,959M",
        "EPS": "$5.53",
        "Small Contract": "$365M",
    }])
    assert rows == [{
        "Document Name": "Amazon.pdf",
        "Revenue": "$638B",
        "EPS": "$5.53",
        "Small Contract": "$365M",
    }]


def test_opencode_env_aliases_gemini_key_for_google_generative_ai():
    from backend.providers import OpenCodeProvider

    provider = OpenCodeProvider(Settings(
        gemini_api_key="test-key",
        google_api_key=None,
        google_generative_ai_api_key=None,
    ))
    env = provider._env()
    assert env["GEMINI_API_KEY"] == "test-key"
    assert env["GOOGLE_API_KEY"] == "test-key"
    assert env["GOOGLE_GENERATIVE_AI_API_KEY"] == "test-key"


def test_opencode_env_passes_openrouter_key():
    from backend.providers import OpenCodeProvider

    provider = OpenCodeProvider(Settings(
        opencode_api_provider="openrouter",
        openrouter_api_key="test-openrouter-key",
        opencode_model="openrouter/anthropic/claude-3.5-sonnet",
    ))
    env = provider._env()
    assert env["OPENROUTER_API_KEY"] == "test-openrouter-key"


def test_opencode_env_passes_anthropic_key():
    from backend.providers import OpenCodeProvider

    provider = OpenCodeProvider(Settings(
        opencode_api_provider="anthropic",
        anthropic_api_key="test-anthropic-key",
        opencode_model="anthropic/claude-sonnet-4-20250514",
    ))
    env = provider._env()
    assert env["ANTHROPIC_API_KEY"] == "test-anthropic-key"


def test_opencode_auth_error_is_not_parsed_as_rows():
    import pytest

    from backend.providers import OpenCodeProvider, ProviderError

    provider = OpenCodeProvider(Settings())
    with pytest.raises(ProviderError, match="API key is missing"):
        provider._raise_for_opencode_error(
            "\x1b[91mError: \x1b[0mGoogle Generative AI API key is missing. "
            "Pass it using the GOOGLE_GENERATIVE_AI_API_KEY environment variable."
        )


def test_replacement_query_targets_existing_column_without_reset():
    from backend.api import _replacement_pair

    table_context = {
        "columns": [
            {"label": "Document Name"},
            {"label": "Total Net Sales"},
            {"label": "Cost of Sales"},
        ],
        "rows": [],
    }

    replacement = _replacement_pair(
        "Instead of total net sales, get me a summary of the document.",
        table_context,
        ["Summary"],
    )

    assert replacement == {"old": "Total Net Sales", "new": "Summary"}


def test_trailing_instead_of_query_targets_existing_column():
    from backend.api import _replacement_pair

    table_context = {
        "columns": [
            {"label": "Document Name"},
            {"label": "Revenue"},
            {"label": "Cost of Revenue"},
            {"label": "EBITDA"},
        ],
        "rows": [],
    }

    replacement = _replacement_pair(
        "Can you get me net profit instead of the cost of revenue?",
        table_context,
        ["Net Profit"],
    )

    assert replacement == {"old": "Cost of Revenue", "new": "Net Profit"}


def test_opencode_model_access_error_is_not_parsed_as_rows():
    import pytest

    from backend.providers import OpenCodeProvider, ProviderError

    provider = OpenCodeProvider(Settings())
    with pytest.raises(ProviderError, match="could not access"):
        provider._raise_for_opencode_error(
            "Publisher Model `projects/example/locations/us-central1/publishers/google/models/gemini-3-pro-preview` "
            "was not found or your project does not have access to it."
        )


def test_local_embedding_index_retrieves_relevant_chunks():
    import shutil
    import uuid
    from pathlib import Path

    from backend.rag_index import LocalEmbeddingIndex

    tmp_path = Path(".tmp") / f"test-rag-index-{uuid.uuid4().hex}"
    try:
        index = LocalEmbeddingIndex(tmp_path)
        path = index.ensure_index(
            "session_test",
            "file123",
            "Amazon-10k-2024.pdf",
            "Operating cash flow increased strongly.\n\n"
            "Revenue grew while infrastructure spending also increased.\n\n"
            "Legal proceedings are discussed elsewhere.",
        )
        chunks = index.retrieve(path, "revenue and infrastructure spending", top_k=2)
        assert chunks
        assert any("Revenue grew" in chunk["text"] for chunk in chunks)
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)


def test_supporting_citation_uses_filename_and_source_chunk():
    import shutil
    import uuid
    from pathlib import Path

    from backend.config import Settings
    from backend.storage import SessionStore

    tmp_path = Path(".tmp") / f"test-citations-{uuid.uuid4().hex}"
    settings = Settings(
        local_storage_dir=tmp_path / "storage",
        session_store=tmp_path / "storage" / "sessions.json",
    )
    try:
        store = SessionStore(settings)
        session = store.get_or_create("session_test")
        file_id = "file123"
        display_name = "Amazon-10k-2024.pdf"
        text_dir = settings.local_storage_dir / "indexes" / "session_test"
        text_dir.mkdir(parents=True, exist_ok=True)
        (text_dir / f"{file_id}_Amazon-10k-2024.txt").write_text(
            "Revenue was $638B for the period. Cost of revenue was $326B.",
            encoding="utf-8",
        )
        session["uploaded_files"] = [{
            "file_id": file_id,
            "filename": display_name,
            "display_name": display_name,
            "path": str(tmp_path / display_name),
        }]
        store.save()

        citation = store.supporting_citation("session_test", display_name, "Cost of revenue", "$326B")
        assert citation["source"] == "file"
        assert citation["filename"] == display_name
        assert "Cost of revenue was $326B" in citation["excerpt"]
    finally:
        shutil.rmtree(tmp_path, ignore_errors=True)
