# Security Policy

## Supported Versions

This project is currently pre-1.0. Security fixes are applied to the main branch.

## Reporting A Vulnerability

Please report suspected vulnerabilities privately to the repository maintainers. Do not open a public issue containing API keys, uploaded documents, logs with secrets, or private customer data.

## Secret Handling

- Never commit `.env`.
- Never commit provider keys, service-account files, PEM files, uploaded documents, generated indexes, or logs.
- Rotate any key that appears in a terminal log, screenshot, issue, pull request, or commit.
- Use `.env.example` for documentation and `.env` for local credentials.

## Local Data Handling

By default, uploads and generated session state are stored under `./storage`, and retrieval indexes are stored under `~/.users/embeddings/data-extraction-agent-open`. These paths are local-only and should not be included in source archives.

## Provider Boundary

OpenCode runs locally and receives provider credentials only through subprocess environment variables. The React frontend does not receive provider API keys.
