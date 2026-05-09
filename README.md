# Data Extraction Agent Open

Open-source, local-first document extraction agent for turning PDFs, spreadsheets, and documents into structured tables through OpenCode. Users bring their own model provider key, upload files into their own local file store, and interact with the extracted data through a spreadsheet-style UI.

## Highlights

- OpenCode is the fixed execution engine. Users choose which provider/model route OpenCode runs.
- Local file storage by default. Uploads, sessions, generated text indexes, and retrieval indexes are kept out of git.
- Natural-language table editing. Follow-up prompts can add, replace, or refine columns without rebuilding the whole table.
- File-grounded extraction. The backend attaches retrieved context, full text indexes, and source files to OpenCode.
- Provider-flexible setup. Anthropic, OpenAI, Gemini, OpenRouter, and custom OpenCode routes are supported.
- Streaming UI. The FastAPI backend streams progress, columns, values, reasoning, and citations over WebSockets.
- Export-ready table. The frontend provides an Excel-style grid and export workflow.

## Architecture

```text
frontend/                 React + Vite table/chat UI
backend/                  FastAPI API, WebSocket router, storage, provider adapter
prompts/                  OpenCode agent prompts for extraction and analysis
tests/                    Backend smoke tests and provider-routing tests
opencode.json             OpenCode agent configuration
cli.py                    Oriplex Data Gateway launcher
oriplex-data.*            Local gateway command shims
.env.example              Safe configuration template
```

Runtime-generated data is intentionally outside source control:

```text
storage/                  Uploaded files, sessions, generated text indexes
~/.users/embeddings/      User-local retrieval indexes
.env                      User provider keys and local settings
```

## Quick Start

Prerequisites:

- Python 3.11+
- Node.js 18+
- OpenCode installed and available as `opencode`
- A provider key for Anthropic, OpenAI, Gemini, OpenRouter, or an already configured custom OpenCode route

Run the local app:

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm --prefix frontend install
.\oriplex-data.ps1
```

The gateway asks for:

1. API provider for OpenCode.
2. Provider API key.
3. Model route.

It then starts:

- Backend: `http://localhost:8101`
- Frontend: `http://localhost:5173`
- Health check: `http://localhost:8101/api/health`

## Oriplex Data Gateway

The recommended entrypoint is the Oriplex Data Gateway. It configures the provider key, writes only local `.env` settings, starts the backend and frontend, prints the active API/model/storage routes, and opens the local frontend.

Windows PowerShell:

```powershell
.\oriplex-data.ps1
```

Windows CMD:

```cmd
oriplex-data.cmd
```

Cross-platform fallbacks:

```powershell
npm run gateway
python cli.py
```

Useful gateway commands:

```powershell
python cli.py setup      # configure provider/model/key only
python cli.py start      # start from the existing .env
python cli.py doctor     # check local dependencies and live ports
python cli.py models     # print supported OpenCode model routes
```

`oriplex-gateway.ps1` and `oriplex-gateway.cmd` are aliases for teams that prefer the gateway naming.

## Manual Start

```powershell
Copy-Item .env.example .env
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8101 --reload
```

In a second terminal:

```powershell
$env:VITE_API_URL="http://localhost:8101"
$env:VITE_SESSION_SERVICE_URL="http://localhost:8101/api"
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

## Provider Configuration

`DATA_EXTRACTION_PROVIDER` should stay set to `opencode`. Select the model backend with:

```dotenv
OPENCODE_API_PROVIDER=anthropic
OPENCODE_MODEL=anthropic/claude-sonnet-4-6
ANTHROPIC_API_KEY=
```

Supported provider keys:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`, `GOOGLE_API_KEY`, or `GOOGLE_GENERATIVE_AI_API_KEY`
- `OPENROUTER_API_KEY`

The backend passes configured keys only to the local `opencode run` subprocess environment. Keys are not sent to the frontend and `.env` is ignored by git.

### Current Model Presets

The model presets were checked against official provider docs on May 9, 2026.

Anthropic:

- `anthropic/claude-opus-4-7`
- `anthropic/claude-sonnet-4-6`
- `anthropic/claude-haiku-4-5-20251001`
- Custom `anthropic/<model-name>`

OpenAI:

- `openai/gpt-5.5`
- `openai/gpt-5.4`
- `openai/gpt-5.4-mini`
- `openai/gpt-5.4-nano`
- Custom `openai/<model-name>`

Gemini:

- `google-vertex/gemini-3-pro-preview`
- `google-vertex/gemini-3-flash-preview`
- `google-vertex/gemini-2.5-pro`
- `google-vertex/gemini-2.5-flash`
- Custom `google-vertex/<gemini-model-name>`

OpenRouter:

- Custom `openrouter/<provider>/<model>`

OpenRouter has many routes and changes quickly, so the app asks the user to enter the route exactly as it appears in their OpenRouter account.

## How Extraction Works

1. Files are uploaded to `./storage/uploads/<session_id>/`.
2. The backend extracts text and writes a local text index.
3. A lightweight local retrieval index is generated under `~/.users/embeddings/data-extraction-agent-open`.
4. The backend creates a task file under `./storage/opencode_tasks/`.
5. OpenCode receives the task file, retrieved context, text index, and source file as attachments.
6. OpenCode returns JSON rows.
7. The backend streams columns and cell values to the UI.

The system prompt explicitly rejects canned schemas and deterministic keyword extraction. Column labels and values are inferred from the latest user request, table context, and uploaded file content.

## API

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

## Tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
cmd.exe /c npm.cmd --prefix frontend run build
```

## Security And Privacy

- Do not commit `.env`, provider keys, uploaded files, generated exports, local logs, virtual environments, or `node_modules`.
- Publish from the tracked-file allowlist: `git ls-files`.
- Keep `storage/` and `~/.users/embeddings/data-extraction-agent-open` local to each user.
- Rotate any key that was ever pasted into a terminal, log, screenshot, issue, or commit.
- The default CORS configuration allows localhost development ports only.

## Open Source Release Checklist

Before publishing:

```powershell
git status --short
git ls-files -o --exclude-standard
.\.venv\Scripts\python.exe -m pytest tests -q
cmd.exe /c npm.cmd --prefix frontend run build
```

Confirm:

- `.env` is not tracked.
- `storage/` is not tracked.
- No log files are tracked.
- `node_modules/`, `.venv/`, and generated build outputs are not tracked.
- `backend/rag_index.py`, `opencode.json`, and `prompts/` are intentionally included.

To build a source archive from tracked files only:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create_source_archive.ps1
```

The generated archive is written to `dist/data-extraction-agent-open-source.zip`, which is ignored by git.

## License

MIT. See [LICENSE](LICENSE). The frontend includes an upstream MIT license notice in [frontend/LICENSE.md](frontend/LICENSE.md).
