from __future__ import annotations

from app.errors import ApiError
from app.routers import districts, exports, meta, rasters, scenarios, schools, scoring
from app.services.rasters import RasterClipResult


def test_healthz(client):
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_meta_layers_returns_repository_rows(client, fake_connection, monkeypatch):
    monkeypatch.setattr(meta, "fetch_layers", lambda connection: [{"layer_key": "flood"}])

    response = client.get("/api/v1/meta/layers")

    assert response.status_code == 200
    assert response.json() == [{"layer_key": "flood"}]


def test_meta_indicators_returns_defaults(client, monkeypatch):
    monkeypatch.setattr(meta, "fetch_indicators", lambda: ["Average AQI", "Conflict Events"])

    response = client.get("/api/v1/meta/indicators")

    assert response.status_code == 200
    assert response.json() == {
        "default": "Average AQI",
        "items": ["Average AQI", "Conflict Events"],
    }


def test_meta_api_error_uses_structured_handler(client, monkeypatch):
    monkeypatch.setattr(
        meta,
        "fetch_provinces",
        lambda connection: (_ for _ in ()).throw(ApiError("Bad metadata.", status_code=418, code="bad_metadata")),
    )

    response = client.get("/api/v1/meta/provinces")

    assert response.status_code == 418
    assert response.json() == {"error": {"code": "bad_metadata", "message": "Bad metadata."}}


def test_list_schools_forwards_filters(client, fake_connection, monkeypatch):
    captured = {}

    def fake_fetch(connection, province=None, district=None, scenario_id=None, limit=500):
        captured.update(
            province=province,
            district=district,
            scenario_id=scenario_id,
            limit=limit,
        )
        return [{"school_id": "1"}]

    monkeypatch.setattr(schools, "fetch_schools", fake_fetch)

    response = client.get(
        "/api/v1/schools",
        params={"province": "NCD", "district": "National Capital District", "scenario_id": "abc", "limit": 25},
    )

    assert response.status_code == 200
    assert response.json() == [{"school_id": "1"}]
    assert captured == {
        "province": "NCD",
        "district": "National Capital District",
        "scenario_id": "abc",
        "limit": 25,
    }


def test_get_school_404_when_missing(client, monkeypatch):
    monkeypatch.setattr(schools, "fetch_school_detail", lambda connection, school_id, scenario_id=None: None)

    response = client.get("/api/v1/schools/missing-school")

    assert response.status_code == 404
    assert response.json() == {"detail": "School not found"}


def test_explain_school_returns_breakdown(client, monkeypatch):
    monkeypatch.setattr(
        schools,
        "fetch_school_detail",
        lambda connection, school_id, scenario_id=None: {
            "school_name": "Demo School",
            "scenario_id": "scenario-1",
            "component_breakdown": {"Need": 0.7},
            "rank_priority": 4,
            "rank_need": 2,
        },
    )

    response = client.get("/api/v1/schools/school-1/explain")

    assert response.status_code == 200
    assert response.json() == {
        "school_id": "school-1",
        "school_name": "Demo School",
        "scenario_id": "scenario-1",
        "component_breakdown": {"Need": 0.7},
        "rank_priority": 4,
        "rank_need": 2,
    }


def test_district_choropleth_returns_selected_indicator(client, monkeypatch):
    monkeypatch.setattr(
        districts,
        "fetch_district_choropleth",
        lambda connection, province=None, district=None: [{"district": "National Capital District"}],
    )

    response = client.get("/api/v1/districts/choropleth", params={"indicator": "Conflict Events", "province": "NCD"})

    assert response.status_code == 200
    assert response.json() == {
        "default_indicator": "Average AQI",
        "selected_indicator": "Conflict Events",
        "features": [{"district": "National Capital District"}],
    }


def test_scenarios_crud_routes(client, monkeypatch):
    monkeypatch.setattr(scenarios, "fetch_scenarios", lambda connection: [{"scenario_id": "scenario-1"}])
    monkeypatch.setattr(
        scenarios,
        "insert_scenario",
        lambda connection, payload: {"scenario_id": "created", **payload},
    )
    monkeypatch.setattr(
        scenarios,
        "fetch_scenario",
        lambda connection, scenario_id: {"scenario_id": scenario_id, "scenario_name": "Default"},
    )
    monkeypatch.setattr(
        scenarios,
        "update_scenario",
        lambda connection, scenario_id, payload: {"scenario_id": scenario_id, **payload},
    )

    list_response = client.get("/api/v1/scenarios")
    create_response = client.post(
        "/api/v1/scenarios",
        json={"scenario_name": "Test Scenario", "weights": {"need": 0.7}, "is_default": False},
    )
    get_response = client.get("/api/v1/scenarios/scenario-1")
    patch_response = client.patch("/api/v1/scenarios/scenario-1", json={"description": "patched"})

    assert list_response.status_code == 200
    assert list_response.json() == [{"scenario_id": "scenario-1"}]
    assert create_response.status_code == 200
    assert create_response.json()["scenario_name"] == "Test Scenario"
    assert get_response.status_code == 200
    assert get_response.json()["scenario_name"] == "Default"
    assert patch_response.status_code == 200
    assert patch_response.json() == {"scenario_id": "scenario-1", "description": "patched"}


def test_create_scenario_validation_error_is_structured(client):
    response = client.post("/api/v1/scenarios", json={"scenario_name": "Broken Scenario"})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert body["error"]["message"] == "Request validation failed."
    assert body["error"]["details"]["issues"]


def test_scoring_run_forwards_payload(client, monkeypatch):
    captured = {}

    def fake_run(connection, **kwargs):
        captured.update(kwargs)
        return {"summary": {"count": 1}, "warnings": [], "top_rows": []}

    monkeypatch.setattr(scoring, "run_and_persist_scenario", fake_run)

    response = client.post(
        "/api/v1/scoring/run",
        json={
            "scenario_name": "Scenario A",
            "description": "desc",
            "weight_overrides": {"need": 0.8},
            "config_overrides": {"stage1_quantile": 0.65},
            "persist": False,
            "created_by": "tester",
            "is_default": True,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"summary": {"count": 1}, "warnings": [], "top_rows": []}
    assert captured == {
        "weight_overrides": {"need": 0.8},
        "config_overrides": {"stage1_quantile": 0.65},
        "scenario_name": "Scenario A",
        "description": "desc",
        "created_by": "tester",
        "persist": False,
        "is_default": True,
    }


def test_exports_return_expected_content_and_headers(client, monkeypatch):
    monkeypatch.setattr(exports, "export_ranked_csv", lambda connection, scenario_id=None: b"a,b\n1,2\n")
    monkeypatch.setattr(exports, "export_ranked_xlsx", lambda connection, scenario_id=None: b"fake-xlsx")

    csv_response = client.get("/api/v1/exports/ranked.csv", params={"scenario_id": "scenario-1"})
    xlsx_response = client.get("/api/v1/exports/ranked.xlsx")

    assert csv_response.status_code == 200
    assert csv_response.headers["content-type"].startswith("text/csv")
    assert csv_response.headers["content-disposition"] == 'attachment; filename="ranked_schools.csv"'
    assert csv_response.content == b"a,b\n1,2\n"

    assert xlsx_response.status_code == 200
    assert xlsx_response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert xlsx_response.headers["content-disposition"] == 'attachment; filename="ranked_schools.xlsx"'
    assert xlsx_response.content == b"fake-xlsx"


def test_raster_status_uses_settings(client, fake_settings, monkeypatch):
    monkeypatch.setattr(rasters, "get_settings", lambda: fake_settings)

    response = client.get("/api/v1/rasters/status")

    assert response.status_code == 200
    body = response.json()
    assert body["gcs_bucket"] == "adb-school-optimize"
    assert body["gcs_project"] == "adb-sr"
    assert body["layers"][0]["layer"] == "flood"
    assert body["layers"][1]["layer"] == "landcover"


def test_raster_metadata_and_overlay_routes(client, monkeypatch):
    clip_result = RasterClipResult(
        content=b"png-bytes",
        media_type="image/png",
        filename="flood_demo.png",
        bounds_4326=(147.0, -9.6, 147.3, -9.3),
        district="National Capital District",
        province="National Capital District",
        layer="flood",
        source_uri="gs://adb-school-optimize/rise-png/rasters/flood/PNG_flood_JRC.tif",
        width=321,
        height=232,
    )

    monkeypatch.setattr(rasters, "clip_raster_for_district", lambda connection, **kwargs: clip_result)
    monkeypatch.setattr(
        rasters,
        "build_raster_metadata",
        lambda result, opacity: {
            "layer": result.layer,
            "district": result.district,
            "province": result.province,
            "opacity": opacity,
            "bounds_4326": result.bounds_4326,
            "source_uri": result.source_uri,
            "width": result.width,
            "height": result.height,
        },
    )
    monkeypatch.setattr(
        rasters,
        "build_raster_headers",
        lambda result, opacity: {
            "X-Raster-Layer": result.layer,
            "X-Raster-Opacity": str(opacity),
            "Content-Disposition": f'inline; filename="{result.filename}"',
        },
    )

    metadata_response = client.get(
        "/api/v1/rasters/flood/metadata",
        params={"district": "National Capital District", "province": "National Capital District"},
    )
    overlay_response = client.get(
        "/api/v1/rasters/flood/overlay",
        params={"district": "National Capital District", "province": "National Capital District", "format": "png"},
    )

    assert metadata_response.status_code == 200
    assert metadata_response.json() == {
        "layer": "flood",
        "district": "National Capital District",
        "province": "National Capital District",
        "opacity": 0.55,
        "bounds_4326": [147.0, -9.6, 147.3, -9.3],
        "source_uri": "gs://adb-school-optimize/rise-png/rasters/flood/PNG_flood_JRC.tif",
        "width": 321,
        "height": 232,
    }

    assert overlay_response.status_code == 200
    assert overlay_response.content == b"png-bytes"
    assert overlay_response.headers["x-raster-layer"] == "flood"
    assert overlay_response.headers["x-raster-opacity"] == "0.55"
    assert overlay_response.headers["content-disposition"] == 'inline; filename="flood_demo.png"'
