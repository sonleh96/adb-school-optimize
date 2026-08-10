"""FastAPI application factory and middleware configuration for the API."""

from __future__ import annotations

import json
import logging
import re
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .db import close_pool, open_pool
from .errors import register_exception_handlers
from .models.api import HealthResponse
from .routers.districts import router as districts_router
from .routers.exports import router as exports_router
from .routers.meta import router as meta_router
from .routers.rasters import router as rasters_router
from .routers.scenarios import router as scenarios_router
from .routers.schools import router as schools_router
from .routers.scoring import router as scoring_router
from .security import require_authenticated_user
from .settings import get_settings


@asynccontextmanager
async def lifespan(_app: FastAPI):
    settings = get_settings()
    if settings.database_url:
        open_pool(settings)
    try:
        yield
    finally:
        close_pool()


app = FastAPI(title="RISE-PNG API", version="0.1.0", lifespan=lifespan)
settings = get_settings()
logger = logging.getLogger("uvicorn.access")
request_id_pattern = re.compile(r"^[A-Za-z0-9._-]{1,100}$")

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
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
app.include_router(meta_router, dependencies=protected)
app.include_router(schools_router, dependencies=protected)
app.include_router(districts_router, dependencies=protected)
app.include_router(scenarios_router, dependencies=protected)
app.include_router(scoring_router, dependencies=protected)
app.include_router(exports_router, dependencies=protected)
app.include_router(rasters_router, dependencies=protected)


@app.get("/", response_model=HealthResponse, tags=["health"])
def root() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def healthz() -> HealthResponse:
    return HealthResponse(status="ok")
