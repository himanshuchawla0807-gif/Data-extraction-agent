# Data Extraction Agent Open

Open-source data extraction agent for local document upload, grid/table review, provider-routed extraction, verification, and export.

## What Is Included

- FastAPI backend with localhost API routes.
- WebSocket streaming for upload/index/extraction progress.
- OpenCode-backed provider router. OpenCode is always the execution engine; the user selects the API provider/model route OpenCode should run.
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

The launcher always runs extraction through OpenCode with direct access to the uploaded file store. When prompted, choose the API provider/model route OpenCode should use, then enter that provider's API key if you want the app to pass it into the OpenCode subprocess.

For OpenRouter, choose `openrouter`, paste the user's OpenRouter key, then enter the exact OpenCode route such as `openrouter/anthropic/claude-3.5-sonnet` or any other route supported by that user's OpenRouter account. For Anthropic, choose `anthropic`, paste the user's Anthropic key, then choose a listed Claude route or enter a custom `anthropic/<model-name>` route.

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

`DATA_EXTRACTION_PROVIDER` should stay set to `opencode`. Select the model backend for OpenCode with:

- `OPENCODE_API_PROVIDER=anthropic`
- `OPENCODE_API_PROVIDER=gemini`
- `OPENCODE_API_PROVIDER=openai`
- `OPENCODE_API_PROVIDER=openrouter`
- `OPENCODE_API_PROVIDER=custom`

Set `OPENCODE_MODEL` to the full OpenCode model route, for example `anthropic/claude-sonnet-4-20250514`, `google-vertex/gemini-3.1-pro-preview`, or an OpenRouter route. Add the matching API key when you want this app to provide credentials to OpenCode:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `OPENROUTER_API_KEY`

The backend passes only the selected provider key into the `opencode run` subprocess environment. Keys are never stored in the frontend, uploaded files stay under `./storage`, and generated retrieval indexes stay under the user's local `~/.users/embeddings/data-extraction-agent-open` directory by default.

When the backend starts extraction, it writes a local text index plus a user-local retrieval index under `~/.users/embeddings/data-extraction-agent-open`. It attaches the retrieved context, text index, and uploaded source file to `opencode run --model <OPENCODE_MODEL>`. OpenCode infers columns from the latest user request, table context, and uploaded file content without hard-coded financial presets.

Claude Code is not bundled with this project. To use a Claude model through the local file-agent path, configure OpenCode with your Claude/Anthropic route and set `OPENCODE_MODEL` to that route, for example `anthropic/claude-sonnet-4-20250514`.

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

Before publishing a source archive, use `git ls-files` as the allowlist. This repository intentionally ignores `.env`, `storage/`, generated logs, uploaded files, local embeddings, and virtual environments.

The old Oriplex source references were:

- Backend: `app/agents/data_extraction/`
- Frontend: `Data Extraction Agent Frontend/Data extraction agent/editable-react-table/`
