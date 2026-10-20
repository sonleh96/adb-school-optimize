"""Authentication and caching of the screening routes, against the real app and a real database."""

from __future__ import annotations

import time
import uuid
from dataclasses import replace

import jwt
import pytest
from app.main import app
from app.screening_queries import school_key
from app.settings import get_settings
from screening_api_helpers import load_synthetic
from screening_db_factories import AWKWARD_NAMES as AWK
from screening_db_helpers import load

SCREENING_PATHS = {
    "/api/v1/screening/rules",
    "/api/v1/screening/input-versions",
    "/api/v1/screening/results",
    "/api/v1/screening/inputs",
    "/api/v1/screening/schools/{school_id}",
    "/api/v1/screening/schools/by-key/{school_key}",
    "/api/v1/screening/compare",
    "/api/v1/screening/exports/top.csv",
    "/api/v1/screening/exports/top.xlsx",
    "/api/v1/screening/exports/incomplete.csv",
}
PINNED = "private, max-age=300, stale-while-revalidate=600"
DEFAULT = "private, max-age=60, stale-while-revalidate=120"


@pytest.fixture
def loaded(api, connection):
    return load_synthetic(connection)


# ---------------------------------------------------------------------------------------------
# Authentication.
# ---------------------------------------------------------------------------------------------


def test_every_screening_route_rejects_an_unauthenticated_request(api, monkeypatch):  # API9
    secret = "test-secret-with-sufficient-length"
    monkeypatch.setenv("AUTH_REQUIRED", "true")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)
    get_settings.cache_clear()
    # Read the routes from the app itself, so a route added later is covered without editing this test.
    paths = {p for p in app.openapi()["paths"] if p.startswith("/api/v1/screening")}
    assert paths == SCREENING_PATHS

    for path in sorted(paths):
        url = path.replace("{school_id}", str(uuid.uuid4())).replace("{school_key}", "0" * 32)
        missing = api.get(url, params={"a": "additive_u", "b": "benchmark"})
        invalid = api.get(
            url, headers={"Authorization": "Bearer invalid"}, params={"a": "additive_u", "b": "benchmark"}
        )
        for response in (missing, invalid):
            assert response.status_code == 401, path
            assert response.json()["error"]["code"] == "unauthorized", path

    # The same app answers a valid token, so the 401s above come from authentication and not from a broken route.
    now = int(time.time())
    token = jwt.encode(
        {
            "sub": "user-1",
            "email": "analyst@example.org",
            "aud": "authenticated",
            "iss": "https://example.supabase.co/auth/v1",
            "iat": now,
            "exp": now + 300,
        },
        secret,
        algorithm="HS256",
    )
    allowed = api.get("/api/v1/screening/rules", headers={"Authorization": f"Bearer {token}"})
    assert allowed.status_code == 200 and allowed.json()["default_rule_id"] == "additive_u"


# ---------------------------------------------------------------------------------------------
# Cache headers.
# ---------------------------------------------------------------------------------------------


def json_urls(loaded) -> list[str]:
    school = loaded.school_ids[AWK[7]]
    key = school_key(loaded.input_version, AWK[7])
    return [
        "/api/v1/screening/rules",
        "/api/v1/screening/input-versions",
        "/api/v1/screening/results?rule=additive_u",
        "/api/v1/screening/inputs",
        f"/api/v1/screening/schools/{school}",
        f"/api/v1/screening/schools/by-key/{key}",
        "/api/v1/screening/compare?a=additive_u&b=additive_no_u",
    ]


def test_json_responses_carry_a_cache_policy_and_a_validator(api, loaded):  # API10
    for url in json_urls(loaded):
        response = api.get(url)
        assert response.status_code == 200, url
        assert response.headers["cache-control"] == DEFAULT, url
        assert response.headers["etag"].startswith('W/"'), url

    pinned = api.get(f"/api/v1/screening/results?rule=additive_u&input_version={loaded.input_version}")
    assert pinned.headers["cache-control"] == PINNED
    assert pinned.headers["x-screening-input-version"] == loaded.input_version
    assert len(pinned.headers["x-screening-input-sha256"]) == 64


def test_a_matching_validator_gets_304_and_any_other_gets_the_body(api, loaded):  # API10
    for url in json_urls(loaded):
        first = api.get(url)
        etag = first.headers["etag"]

        again = api.get(url, headers={"If-None-Match": etag})
        assert again.status_code == 304 and again.content == b"", url
        assert again.headers["etag"] == etag and again.headers["cache-control"] == DEFAULT

        strong = api.get(url, headers={"If-None-Match": f'"other", {etag}'})
        assert strong.status_code == 304
        stale = api.get(url, headers={"If-None-Match": 'W/"0000"'})
        assert stale.status_code == 200 and stale.content == first.content


def test_the_validator_follows_the_rule_the_placement_the_filter_and_the_input_version(
    api, connection, loaded
):  # API10
    base = "/api/v1/screening/results"
    tags = {
        api.get(base, params=p).headers["etag"]
        for p in (
            {"rule": "additive_u"},
            {"rule": "additive_no_u"},
            {"rule": "additive_u", "placement": "upper"},
            {"rule": "additive_u", "province": "North"},
        )
    }
    assert len(tags) == 4

    old = api.get(base)
    changed = tuple(
        replace(r, aqi_p95_selected=55.0) if r.school_name == AWK[0] else r for r in loaded.records
    )
    load(connection, changed, "synthetic-v2")

    new = api.get(base)
    assert (
        new.headers["x-screening-input-version"] == "synthetic-v2" != old.headers["x-screening-input-version"]
    )
    assert new.headers["etag"] != old.headers["etag"]
    # A client holding the old default validator gets the new body, not a 304.
    assert api.get(base, headers={"If-None-Match": old.headers["etag"]}).status_code == 200
    # The old version, asked for by name, is unchanged.
    pinned = api.get(base, params={"input_version": loaded.input_version})
    assert pinned.headers["etag"] == old.headers["etag"] and pinned.content == old.content


def test_errors_and_exports_are_not_cacheable(api, loaded):  # API10
    error = api.get("/api/v1/screening/results", params={"rule": "nope"})
    assert error.status_code == 404
    assert "etag" not in error.headers and "cache-control" not in error.headers

    for path in ("top.csv", "top.xlsx", "incomplete.csv"):
        response = api.get(f"/api/v1/screening/exports/{path}")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "private, no-store"
        assert "etag" not in response.headers
        assert response.headers["x-rise-png-decision-use"] == "research-prototype-only"
        assert response.headers["content-disposition"].startswith("attachment; filename=")


# ---------------------------------------------------------------------------------------------
# Control characters.
# ---------------------------------------------------------------------------------------------

BAD_TEXT = ["North\x07", "a\nb", "\x00", "tab\there", "del\x7f", "\x1b[31m"]


@pytest.mark.parametrize("bad", BAD_TEXT)
def test_control_characters_in_any_text_parameter_are_a_422_not_a_500(api, loaded, bad):  # API23
    base = "/api/v1/screening"
    key = "0" * 32
    for path, params in (
        ("/results", {"province": bad}),
        ("/results", {"district": bad}),
        ("/results", {"rule": bad}),
        ("/results", {"input_version": bad}),
        ("/results", {"package_version": bad}),
        ("/inputs", {"input_version": bad}),
        ("/compare", {"a": bad, "b": "additive_u"}),
        ("/compare", {"a": "additive_u", "b": bad}),
        (f"/schools/by-key/{key}", {"input_version": bad}),
        ("/exports/top.csv", {"province": bad}),
        ("/exports/top.xlsx", {"province": bad}),
        ("/exports/top.xlsx", {"district": bad}),
        ("/exports/incomplete.csv", {"district": bad}),
    ):
        response = api.get(base + path, params=params)
        assert response.status_code == 422, (path, params, response.text[:200])
        error = response.json()["error"]
        assert error["code"] == "validation_error"
        assert error["details"]["issues"][0]["type"] == "control_characters"
    # Ordinary text, including accents and spaces, is not touched.
    assert (
        api.get(base + "/results", params={"province": "North", "district": "North One"}).status_code == 200
    )
    assert api.get(base + "/results", params={"province": "Île de France"}).status_code == 200


def test_a_browser_script_may_read_the_screening_headers_and_the_filename(api, loaded):  # API25
    origin = {"Origin": "http://localhost:3000"}
    results = api.get("/api/v1/screening/results", headers=origin)
    download = api.get("/api/v1/screening/exports/top.csv", headers=origin)

    for response in (results, download):
        exposed = {h.strip().lower() for h in response.headers["access-control-expose-headers"].split(",")}
        assert {
            "content-disposition",
            "etag",
            "x-screening-input-version",
            "x-screening-input-sha256",
            "x-rise-png-decision-use",
        } <= exposed
        assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    # Every header the screening routes set for the client is among the exposed ones.
    exposed = {h.strip().lower() for h in results.headers["access-control-expose-headers"].split(",")}
    assert {"etag", "x-screening-input-version", "x-screening-input-sha256"} <= exposed
    assert {"etag", "x-screening-input-version", "x-screening-input-sha256"} <= set(results.headers)
    assert {"content-disposition", "x-rise-png-decision-use"} <= set(download.headers)
