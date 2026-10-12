"""Synthetic result-delivery microbenchmark; no model or production calls."""
import asyncio
import json
import tempfile
import time
from pathlib import Path

from backend import api
from backend.auth import principal_id
from backend.config import Settings
from backend.storage import SessionStore


async def benchmark():
    token = principal_id.set("benchmark-owner")
    try:
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            settings = Settings(local_storage_dir=root / "storage", session_store=root / "sessions.json", local_embedding_dir=root / "embeddings")
            store = SessionStore(settings)
            session = store.get_or_create("benchmark")
            session["uploaded_files"] = []
            fields = [f"field-{index}" for index in range(40)]
            # Both baseline and candidate operate on 40 already-extracted cells.
            store.extract_texts = lambda *args, **kwargs: []
            async def workflow(*args, **kwargs):
                return [{"Document Name": "synthetic.txt", **{field: "synthetic" for field in fields}}]
            messages = []
            async def send(session_id, payload):
                messages.append(payload)
            api.run_extraction_workflow = workflow
            api.send_ws = send
            started = time.perf_counter()
            await api.run_and_stream_extraction("benchmark", fields, "synthetic extraction", settings, store)
            elapsed = time.perf_counter() - started
            assert sum(message["type"] == "streamRowData" for message in messages) == 40
            return elapsed
    finally:
        principal_id.reset(token)


if __name__ == "__main__":
    elapsed = asyncio.run(benchmark())
    path = Path(__file__).resolve().parents[3] / "docs/rebuild-audit/extraction-benchmark.json"
    result = json.loads(path.read_text())
    result["after_delivery_seconds"] = elapsed
    result["seconds_saved"] = result["before_delivery_seconds"] - elapsed
    result["scope"] = "Result-delivery artificial-delay microbenchmark; candidate actual API with stubbed completed model output. No end-to-end latency or quality claim."
    path.write_text(json.dumps(result, indent=2))
    print(json.dumps(result))
