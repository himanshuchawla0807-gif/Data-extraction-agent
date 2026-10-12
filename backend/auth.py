"""Fail-closed identity boundaries; local development is explicitly loopback-only."""
import asyncio
from contextvars import ContextVar
from fastapi import HTTPException

principal_id = ContextVar("extraction_principal", default=None)


async def authenticate(connection, settings):
    token = connection.headers.get("authorization", "")
    if connection.scope["type"] == "websocket" and not token:
        token = "Bearer " + connection.query_params.get("token", "")
    host = connection.client.host if connection.client else ""
    if settings.local_development_mode and host in {"127.0.0.1", "::1", "localhost"}:
        return "local"
    if not token.startswith("Bearer ") or not token[7:].strip():
        raise HTTPException(401, "Authentication required")
    try:
        from firebase_admin import auth, get_app, initialize_app
        try:
            get_app()
        except ValueError:
            initialize_app()
        decoded = await asyncio.to_thread(auth.verify_id_token, token[7:], check_revoked=True)
        return decoded["uid"]
    except Exception as error:
        raise HTTPException(401, "Invalid authentication token") from error
