# Open Source Release Guide

Use this checklist before publishing Data Extraction Agent Open to GitHub.

## Source Allowlist

Use tracked files as the release source:

```powershell
git ls-files
```

Do not zip the working directory directly. The working directory may contain `.env`, logs, local uploads, node modules, virtual environments, and generated indexes.

## Required Checks

```powershell
git status --short
git ls-files -o --exclude-standard
.\.venv\Scripts\python.exe -m pytest tests -q
cmd.exe /c npm.cmd --prefix frontend run build
```

Review every untracked source file before the first open-source commit. It is fine to add intentional project files such as docs, prompts, or config templates. It is not fine to add local runtime data, logs, credentials, generated exports, uploads, virtual environments, or dependency folders.

## Secret Audit

Run a tracked-file scan before publishing:

```powershell
$files = git ls-files | Where-Object { Test-Path $_ }
$patterns = @(
  'sk-[A-Za-z0-9_-]{20,}',
  'AIza[0-9A-Za-z_-]{20,}',
  'OPENAI_API_KEY=.+',
  'ANTHROPIC_API_KEY=.+',
  'GEMINI_API_KEY=.+',
  'GOOGLE_API_KEY=.+',
  'GOOGLE_GENERATIVE_AI_API_KEY=.+',
  'OPENROUTER_API_KEY=.+'
)
foreach ($p in $patterns) {
  Select-String -Path $files -Pattern $p -AllMatches -ErrorAction SilentlyContinue
}
```

Any hit outside dummy tests or `.env.example` must be investigated before release.

## Provider Verification

Confirm `backend/model_catalog.py` uses current official model IDs and keeps custom route options for:

- Anthropic
- OpenAI
- Gemini
- OpenRouter
- Custom OpenCode routes

OpenRouter should remain custom-route based because its model catalog changes frequently.

## Build A Source Archive

After committing the intended source files:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create_source_archive.ps1
```

The script copies only `git ls-files` into a temporary package directory and writes `dist/data-extraction-agent-open-source.zip`.
