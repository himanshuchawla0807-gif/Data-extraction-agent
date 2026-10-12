"""Dependency-free storage and input boundaries shared by extraction entrypoints."""
from __future__ import annotations

import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any


class RevisionConflict(RuntimeError):
    pass


def validate_identifier(value: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", value):
        raise ValueError("Invalid session or document identifier")
    return value


def contained_path(root: Path, *parts: str) -> Path:
    base = root.resolve()
    candidate = base.joinpath(*parts).resolve()
    if not candidate.is_relative_to(base):
        raise ValueError("Path escapes storage root")
    return candidate


class SessionRepository:
    """Transactional local persistence; deployments with replicas need a shared DB.

    Per-record compare-and-swap prevents silently overwriting another process's
    updates. No session eviction or age-based deletion occurs during reads/writes.
    """

    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL)")

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.execute("PRAGMA busy_timeout=10000")
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def load(self) -> tuple[dict[str, Any], dict[str, int]]:
        with self.connect() as connection:
            records = connection.execute("SELECT id, payload, revision FROM sessions").fetchall()
        return ({key: json.loads(payload) for key, payload, _ in records}, {key: revision for key, _, revision in records})

    def write(self, session_id: str, payload: dict, revision: int = 0) -> int:
        validate_identifier(session_id)
        encoded = json.dumps(payload, default=lambda value: value.isoformat() if isinstance(value, datetime) else str(value))
        with self.connect() as connection:
            if revision == 0:
                try:
                    connection.execute("INSERT INTO sessions VALUES (?, ?, 1)", (session_id, encoded))
                except sqlite3.IntegrityError as error:
                    raise RevisionConflict("Session was created by another writer; reload and retry") from error
            else:
                updated = connection.execute("UPDATE sessions SET payload=?, revision=revision+1 WHERE id=? AND revision=?", (encoded, session_id, revision))
                if updated.rowcount != 1:
                    raise RevisionConflict("Session changed; reload and retry")
        return revision + 1

    def migrate_json(self, legacy: Path) -> None:
        """Import valid records once, preserve the original backup on any failure."""
        if not legacy.exists():
            return
        payload = json.loads(legacy.read_text(encoding="utf-8"))
        if not isinstance(payload, dict):
            raise ValueError("Legacy session store must contain an object")
        with self.connect() as connection:
            for key, value in payload.items():
                validate_identifier(key)
                if not isinstance(value, dict):
                    raise ValueError("Invalid legacy session record")
                connection.execute("INSERT OR IGNORE INTO sessions VALUES (?, ?, 1)", (key, json.dumps(value)))
