"""FastAPI application factory and middleware configuration for the API."""

from __future__ import annotations

import json
import logging
import re
import sys
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

from .db import close_pool, open_pool
from .errors import register_exception_handlers
from .routers.screening import router as screening_router
from .security import require_authenticated_user
from .settings import get_settings


class HealthResponse(BaseModel):
    status: str


# One JSON line per request, on standard output, where Cloud Run reads it. The app has its own logger: uvicorn's
# `uvicorn.access` formats its records from five arguments (client, method, path, version, status), so a record
# made from a ready-made message raises `ValueError` there and prints a traceback instead of the line.
logger = logging.getLogger("rise_png.http")


def _log_to_stdout() -> None:
    """Send the request log to the current standard output as bare messages, once however often the app starts."""
    for handler in list(logger.handlers):
        logger.removeHandler(handler)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _log_to_stdout()
    settings = get_settings()
    if settings.database_url:
        open_pool(settings)
    try:
        yield
    finally:
        close_pool()


app = FastAPI(title="RISE-PNG API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
request_id_pattern = re.compile(r"^[A-Za-z0-9._-]{1,100}$")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    # A browser script can read only the response headers named here. The screening client needs them all.
    expose_headers=[
        "Content-Disposition",
        "ETag",
        "X-Request-ID",
        "X-RISE-PNG-Decision-Use",
        "X-Screening-Input-Version",
        "X-Screening-Input-Sha256",
    ],
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    incoming_request_id = request.headers.get("x-request-id", "")
    request_id = incoming_request_id if request_id_pattern.fullmatch(incoming_request_id) else str(uuid4())
    request.state.request_id = request_id
    started_at = perf_counter()
    response = await call_next(request)
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if request.headers.get("x-forwarded-proto") == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
            separators=(",", ":"),
        )
    )
    return response


register_exception_handlers(app)

protected = [Depends(require_authenticated_user)]
app.include_router(screening_router, dependencies=protected)


@app.get("/", response_model=HealthResponse, tags=["health"])
def root() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def healthz() -> HealthResponse:
    return HealthResponse(status="ok")
