# Contributing

Thanks for improving Data Extraction Agent Open.

## Local Development

```powershell
python -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm --prefix frontend install
python cli.py
```

## Quality Checks

Run these before opening a pull request:

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
cmd.exe /c npm.cmd --prefix frontend run build
```

## Pull Request Expectations

- Keep extraction behavior file-grounded. Do not add canned financial values or deterministic preset matrices.
- Keep provider credentials out of source code, logs, tests, screenshots, and docs.
- Add focused tests when changing provider routing, storage, retrieval, parsing, or WebSocket table behavior.
- Keep generated artifacts out of commits. Use `git ls-files` as the source release allowlist.

## Model Catalog Updates

Provider model names change. When updating `backend/model_catalog.py`, verify model IDs against official provider docs and prefer custom-route options for providers with large or fast-changing catalogs.
