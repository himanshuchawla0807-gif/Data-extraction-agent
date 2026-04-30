from fastapi.testclient import TestClient

from backend.intent import fields_from_query
from backend.main import app


def test_health_uses_mock_provider():
    client = TestClient(app)
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "data-extraction-agent-open"
    assert payload["provider_key_available"] is True


def test_financial_query_expands_to_financial_fields():
    fields = fields_from_query("Extract financials from the files")
    assert "Revenue" in fields
    assert "Net Income" in fields
    assert "Total Assets" in fields
    assert len(fields) > 3
