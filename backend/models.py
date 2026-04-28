"""Shared request/response models."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class Citation(BaseModel):
    source: str
    page_number: Optional[int] = None
    excerpt: Optional[str] = None
    relevance_score: Optional[float] = None


class ExtractionRequest(BaseModel):
    document_ids: List[str] = Field(default_factory=list)
    fields: List[str] = Field(default_factory=list)
    query: Optional[str] = None
    context: Optional[str] = None


class ExtractionResponse(BaseModel):
    extraction_id: str
    extracted_fields: Dict[str, Any]
    citations: List[Citation] = Field(default_factory=list)
    confidence_score: float = 0.75
    created_at: datetime = Field(default_factory=datetime.utcnow)
    error: Optional[str] = None


class SessionFile(BaseModel):
    file_id: str
    filename: str
    display_name: str
    path: str
    size: int
    upload_time: str
    status: str = "uploaded"

