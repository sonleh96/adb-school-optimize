"""Shared API error types and exception translation helpers."""

from __future__ import annotations

import logging

import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


logger = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, message: str, *, status_code: int = 500, code: str = "api_error", details: dict | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or {}


class ConfigurationError(ApiError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=500, code="configuration_error", details=details)


class DependencyError(ApiError):
    def __init__(self, message: str, *, details: dict | None = None) -> None:
        super().__init__(message, status_code=503, code="dependency_error", details=details)


def _error_payload(code: str, message: str, details: dict | None = None) -> dict[str, object]:
    payload: dict[str, object] = {"code": code, "message": message}
    if details:
        payload["details"] = details
    return {"error": payload}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        logger.warning("API error on %s %s: %s", request.method, request.url.path, exc.message)
        return JSONResponse(status_code=exc.status_code, content=_error_payload(exc.code, exc.message, exc.details))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.warning("Validation error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=422,
            content=_error_payload("validation_error", "Request validation failed.", {"issues": exc.errors()}),
        )

    @app.exception_handler(psycopg.Error)
    async def handle_psycopg_error(request: Request, exc: psycopg.Error) -> JSONResponse:
        logger.exception("Database error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=503,
            content=_error_payload(
                "database_error",
                "The database request failed.",
                {"type": exc.__class__.__name__},
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(
            status_code=500,
            content=_error_payload("internal_server_error", "An unexpected server error occurred."),
        )
