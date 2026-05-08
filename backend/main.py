"""FastAPI entrypoint for Data Extraction Agent Open."""

import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.requests import Request

from .api import router
from .config import get_settings

settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("data_extraction.main")

app = FastAPI(
    title=settings.app_name,
    description="Open-source localhost data extraction agent with provider routing.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    local_mode = request.headers.get("x-local-mode") == "true"
    local_user = request.headers.get("x-local-user") or "unknown"
    logger.info(
        "request.start method=%s path=%s local_mode=%s local_user=%s",
        request.method,
        request.url.path,
        local_mode,
        local_user,
    )
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info(
        "request.end method=%s path=%s status=%s elapsed_ms=%.1f",
        request.method,
        request.url.path,
        response.status_code,
        elapsed_ms,
    )
    return response

app.include_router(router, prefix="/api")


@app.get("/")
async def root():
    return {
        "service": "Data Extraction Agent Open",
        "status": "running",
        "api": "/api/health",
        "frontend": settings.frontend_url,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host=settings.host, port=settings.port, reload=True)
