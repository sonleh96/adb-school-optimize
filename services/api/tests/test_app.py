"""The application around the screening routes: health, request tracing, cross-origin policy and the email allowlist.

Failure modes, each with its test:
1. A health check needs a database or a token, or lacks the headers a platform probe and the logs rely on
   -> test_healthz, test_request_id_accepts_only_bounded_safe_values, test_request_log_is_structured
2. A request from an origin that is not configured gets a cross-origin grant
   -> test_random_origin_preflight_is_rejected
3. The email allowlist stops being enforced once the old routes that tested it are gone
   -> test_allowlist_admits_its_domain_and_refuses_others
4. A removed Need/Priority route answers again because a router is mounted back by accident
   -> test_removed_routes_are_not_served
"""

from __future__ import annotations

import json
import logging
import time

import jwt
import pytest
from app.settings import get_settings


def test_healthz(client):
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]
    assert response.headers["x-content-type-options"] == "nosniff"


def test_request_id_accepts_only_bounded_safe_values(client):
    accepted = client.get("/healthz", headers={"X-Request-ID": "briefing_123"})
    replaced = client.get("/healthz", headers={"X-Request-ID": "bad request id"})

    assert accepted.headers["x-request-id"] == "briefing_123"
    assert replaced.headers["x-request-id"] != "bad request id"


def test_request_log_is_structured(client, caplog):
    caplog.set_level(logging.INFO, logger="uvicorn.access")

    response = client.get("/healthz", headers={"X-Request-ID": "trace-1"})

    records = [json.loads(record.message) for record in caplog.records if record.message.startswith("{")]
    assert response.status_code == 200
    assert records[-1] == {
        "event": "http_request",
        "request_id": "trace-1",
        "method": "GET",
        "path": "/healthz",
        "status": 200,
        "duration_ms": records[-1]["duration_ms"],
    }
    assert isinstance(records[-1]["duration_ms"], float)


def test_random_origin_preflight_is_rejected(client):
    response = client.options(
        "/api/v1/screening/rules",
        headers={
            "Origin": "https://attacker.example",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_allowlist_admits_its_domain_and_refuses_others(api, monkeypatch):
    secret = "test-secret-with-sufficient-length"
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    monkeypatch.setenv("AUTH_ALLOWED_EMAIL_DOMAINS", "adb.org")
    get_settings.cache_clear()
    now = int(time.time())

    def token(email):
        claims = {
            "sub": "user-1",
            "email": email,
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "iat": now,
            "exp": now + 300,
        }
        return jwt.encode(claims, secret, algorithm="HS256")

    allowed = api.get(
        "/api/v1/screening/rules", headers={"Authorization": f"Bearer {token('analyst@adb.org')}"}
    )
    denied = api.get(
        "/api/v1/screening/rules", headers={"Authorization": f"Bearer {token('user@example.org')}"}
    )

    assert allowed.status_code == 200
    assert denied.status_code == 403
    assert denied.json()["error"]["code"] == "forbidden"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/schools",
        "/api/v1/districts/choropleth",
        "/api/v1/scenarios",
        "/api/v1/exports/ranked.csv",
        "/api/v1/meta/layers",
        "/api/v1/rasters/status",
    ],
)
def test_removed_routes_are_not_served(client, path):
    assert client.get(path).status_code == 404
