"""Local retrieval index for uploaded documents.

This intentionally avoids provider APIs. It builds a small deterministic local
embedding from hashed lexical features, stores it on disk, and retrieves chunks
for the OpenCode prompt.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any, Dict, Iterable, List, Sequence


TOKEN_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9'&.-]*")


class LocalEmbeddingIndex:
    model_name = "local-hash-embedding-v1"

    def __init__(self, root: Path, dimensions: int = 384):
        self.root = root
        self.dimensions = dimensions
        self.root.mkdir(parents=True, exist_ok=True)

    def ensure_index(self, session_id: str, file_id: str, display_name: str, text: str) -> Path:
        index_path = self._index_path(session_id, file_id)
        if index_path.exists():
            return index_path

        chunks = self._chunk_text(text)
        records = []
        for index, chunk in enumerate(chunks, start=1):
            records.append({
                "chunk_id": index,
                "display_name": display_name,
                "text": chunk,
                "embedding": self._embed(chunk),
            })
        payload = {
            "embedding_model": self.model_name,
            "dimensions": self.dimensions,
            "display_name": display_name,
            "chunks": records,
        }
        index_path.parent.mkdir(parents=True, exist_ok=True)
        index_path.write_text(json.dumps(payload), encoding="utf-8")
        return index_path

    def retrieve(self, index_path: Path, query: str, top_k: int = 10) -> List[Dict[str, Any]]:
        if not index_path.exists():
            return []
        try:
            payload = json.loads(index_path.read_text(encoding="utf-8"))
        except Exception:
            return []

        query_vector = self._embed(query or "")
        scored = []
        for chunk in payload.get("chunks", []):
            embedding = chunk.get("embedding")
            if not isinstance(embedding, list):
                continue
            score = self._cosine(query_vector, embedding)
            scored.append((score, chunk))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [
            {
                "score": round(score, 6),
                "chunk_id": chunk.get("chunk_id"),
                "display_name": chunk.get("display_name") or payload.get("display_name"),
                "text": chunk.get("text", ""),
            }
            for score, chunk in scored[:top_k]
            if chunk.get("text")
        ]

    def write_context_file(
        self,
        session_id: str,
        file_id: str,
        display_name: str,
        source_path: str,
        text_path: str,
        query: str,
        chunks: Sequence[Dict[str, Any]],
    ) -> Path:
        context_path = self._context_path(session_id, file_id)
        parts = [
            f"Document: {display_name}",
            f"Original local file: {source_path}",
            f"Extracted text index: {text_path}",
            f"Local retrieval model: {self.model_name}",
            f"Retrieval query: {query}",
            "",
            "Retrieved document chunks:",
        ]
        for item in chunks:
            parts.append("")
            parts.append(f"[Chunk {item.get('chunk_id')} | score={item.get('score')}]")
            parts.append(" ".join(str(item.get("text") or "").split()))
        context_path.parent.mkdir(parents=True, exist_ok=True)
        context_path.write_text("\n".join(parts), encoding="utf-8", errors="ignore")
        return context_path

    def _index_path(self, session_id: str, file_id: str) -> Path:
        return self.root / session_id / f"{file_id}.json"

    def _context_path(self, session_id: str, file_id: str) -> Path:
        return self.root / session_id / f"{file_id}_retrieved_context.txt"

    def _chunk_text(self, text: str, chunk_chars: int = 2600, overlap: int = 350) -> List[str]:
        clean = "\n".join(line.strip() for line in (text or "").splitlines() if line.strip())
        if not clean:
            return []
        chunks: List[str] = []
        start = 0
        while start < len(clean):
            end = min(start + chunk_chars, len(clean))
            if end < len(clean):
                boundary = max(clean.rfind("\n", start, end), clean.rfind(". ", start, end))
                if boundary > start + chunk_chars // 2:
                    end = boundary + 1
            chunk = clean[start:end].strip()
            if chunk:
                chunks.append(chunk)
            if end >= len(clean):
                break
            start = max(end - overlap, start + 1)
        return chunks

    def _embed(self, text: str) -> List[float]:
        tokens = self._features(text)
        vector = [0.0] * self.dimensions
        for token in tokens:
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            bucket = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vector[bucket] += sign
        norm = math.sqrt(sum(value * value for value in vector))
        if not norm:
            return vector
        return [round(value / norm, 6) for value in vector]

    def _features(self, text: str) -> Iterable[str]:
        tokens = [token.lower().strip("'") for token in TOKEN_RE.findall(text or "")]
        tokens = [token for token in tokens if len(token) > 1]
        for token in tokens:
            yield token
        for left, right in zip(tokens, tokens[1:]):
            yield f"{left} {right}"

    def _cosine(self, left: Sequence[float], right: Sequence[float]) -> float:
        if not left or not right:
            return 0.0
        length = min(len(left), len(right))
        return sum(left[index] * right[index] for index in range(length))
