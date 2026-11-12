import json

import pytest

from backend.rag_index import LocalEmbeddingIndex


def test_changed_document_rebuilds_index(tmp_path):
    index = LocalEmbeddingIndex(tmp_path)
    path = index.ensure_index("case", "file", "report.txt", "Previous revenue: 100")
    index.ensure_index("case", "file", "report.txt", "Current revenue: 200")

    assert index.retrieve(path, "revenue")[0]["text"] == "Current revenue: 200"


@pytest.mark.parametrize("contents", ["{broken", json.dumps({"chunks": []})])
def test_unreadable_or_legacy_index_is_rebuilt(tmp_path, contents):
    index = LocalEmbeddingIndex(tmp_path)
    path = index.ensure_index("case", "file", "report.txt", "Current revenue: 200")
    path.write_text(contents, encoding="utf-8")

    index.ensure_index("case", "file", "report.txt", "Current revenue: 200")

    assert index.retrieve(path, "revenue")[0]["text"] == "Current revenue: 200"
