# Data Extraction Agent Open

Open-source data extraction agent for local document upload, grid/table review, provider-routed extraction, verification, and export.

## What Is Included

- FastAPI backend with localhost API routes.
- WebSocket streaming for upload/index/extraction progress.
- Provider router for `mock`, `openai`, `anthropic`, `gemini`, and `openrouter`.
- LangGraph-compatible extraction workflow with a fallback path if LangGraph is unavailable.
- React/Vite frontend copied from the Oriplex data extraction table/grid experience.
- CLI launcher that shows the Oriplex logo, asks for provider/API key/model, starts localhost, and opens the app.

## Localhost Quick Start

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm --prefix frontend install
python cli.py
```

Choose `mock` first to verify the full workflow without paid API keys.
For OpenRouter, enter the exact model route you want to use when prompted.

The CLI starts:

- Backend: `http://localhost:8101`
- Frontend: `http://localhost:5173`
- API health: `http://localhost:8101/api/health`

## Manual Start

```powershell
Copy-Item .env.example .env
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8101 --reload
```

In a second terminal:

```powershell
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

## Provider Configuration

Set `DATA_EXTRACTION_PROVIDER` in `.env`:

- `mock`
- `openai`
- `anthropic`
- `gemini`
- `openrouter`

Then add the matching API key:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `OPENROUTER_API_KEY`

Model defaults:

- Gemini: `gemini-3.1-pro-preview`
- OpenAI: `gpt-5.5` with `OPENAI_REASONING_EFFORT=medium`
- OpenRouter: user-entered `OPENROUTER_MODEL`

## API Shape

- `GET /api/health`
- `GET /api/providers`
- `POST /api/data-extraction/generate-title`
- `POST /api/data-extraction/upload`
- `POST /api/data-extraction/extract`
- `GET /api/data-extraction/session/{session_id}/files`
- `GET /api/data-extraction/session/{session_id}/table-state`
- `GET /api/data-extraction/files/{session_id}/{filename}`
- `WS /api/ws/{session_id}`
- `WS /api/data-extraction/ws/{session_id}`

## Repository Rules

Do not commit `.env`, credentials, uploaded files, generated exports, `.venv`, `venv`, or `node_modules`.

The old Oriplex source references were:

- Backend: `app/agents/data_extraction/`
- Frontend: `Data Extraction Agent Frontend/Data extraction agent/editable-react-table/`
