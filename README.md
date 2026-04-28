# Data Extraction Agent Open

Open-source-ready data extraction agent for document upload, structured extraction, verification, and export.

## Purpose

- Upload PDFs and documents.
- Extract tables and structured fields.
- Verify extracted values.
- Stream extraction progress to a frontend.

## Planned Stack

- FastAPI backend.
- LangChain and LangGraph orchestration.
- Configurable providers: OpenAI, Gemini, Anthropic, OpenRouter, and mock.
- Local filesystem storage by default.
- Optional frontend copied and trimmed from the existing Oriplex UI.

## Planned Graph

```text
upload -> parse -> extract -> verify -> normalize -> export
```

## Local Setup

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
Copy-Item .env.example .env
```

If frontend code is added:

```powershell
npm install
npm run dev
```

## Source Migration Notes

- Backend reference: `app/agents/data_extraction/`.
- Shared reference code may come from `app/core/`, `app/services/`, and `app/utils/`.
- Frontend reference: `Data Extraction Agent Frontend/Data extraction agent/editable-react-table/` and selected Oriplex UI components.

Do not copy credentials, `.env`, uploads, generated PDFs, `venv`, `.venv`, or `node_modules`.
