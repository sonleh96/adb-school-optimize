"""Tests for auxiliary layer ingestion and normalization behavior."""

from __future__ import annotations

import json
import sys

import pandas as pd

from app.ingestion import load_core_data
from app.ingestion.load_core_data import (
    _csv_point_vector_records,
    _district_records,
    _drop_header_like_school_rows,
    _geojson_vector_records,
)


def test_geojson_vector_records_extract_admin_fields(tmp_path):
    path = tmp_path / "roads.geojson"
    path.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {
                            "osm_id": 123,
                            "name": "Demo Road",
                            "NAM_1": "National Capital District",
                            "NAM_2": "National Capital District",
                        },
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[147.1, -9.5], [147.2, -9.4]],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    records = _geojson_vector_records("roads", path)

    assert len(records) == 1
    assert records[0]["layer_key"] == "roads"
    assert records[0]["source_feature_id"] == "123"
    assert records[0]["feature_name"] == "Demo Road"
    assert records[0]["province"] == "National Capital District"
    assert records[0]["district"] == "National Capital District"
    assert "LINESTRING" in records[0]["geom_wkt"]


def test_csv_point_vector_records_build_point_geometry(tmp_path):
    path = tmp_path / "points.csv"
    path.write_text(
        "ID,xcoord,ycoord,population,NAM_1,NAM_2\n1,147.1,-9.5,10.2,NCD,National Capital District\n",
        encoding="utf-8",
    )

    records = _csv_point_vector_records("pop_access_walk", path)

    assert len(records) == 1
    assert records[0]["layer_key"] == "pop_access_walk"
    assert records[0]["source_feature_id"] == "1"
    assert records[0]["province"] == "NCD"
    assert records[0]["district"] == "National Capital District"
    assert records[0]["geom_wkt"] == "POINT (147.1 -9.5)"


def test_drop_header_like_school_rows_removes_repeated_header_rows():
    df = pd.DataFrame(
        [
            {"School Name": "School Name", "Province": "Province"},
            {"School Name": "Demo School", "Province": "NCD"},
        ]
    )

    cleaned = _drop_header_like_school_rows(df)

    assert cleaned.to_dict(orient="records") == [{"School Name": "Demo School", "Province": "NCD"}]


def test_district_records_map_priority_and_need():
    records = _district_records(
        [
            {
                "type": "Feature",
                "properties": {
                    "Province": "NCD",
                    "District": "National Capital District",
                    "Priority": 82.4,
                    "Need": 77.1,
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [
                        [
                            [147.1, -9.6],
                            [147.2, -9.6],
                            [147.2, -9.5],
                            [147.1, -9.5],
                            [147.1, -9.6],
                        ]
                    ],
                },
            }
        ]
    )

    assert len(records) == 1
    assert records[0]["province"] == "NCD"
    assert records[0]["district"] == "National Capital District"
    assert records[0]["priority"] == 82.4
    assert records[0]["need"] == 77.1


def test_main_skip_schools_runs_district_ingestion_only(monkeypatch):
    calls = {"districts": 0, "schools": 0, "aux": 0, "layers": 0}

    class _FakeContext:
        def __enter__(self):
            return object()

        def __exit__(self, exc_type, exc, tb):
            return False

    monkeypatch.setattr(load_core_data, "get_settings", lambda: object())
    monkeypatch.setattr(load_core_data, "get_db", lambda settings: _FakeContext())
    monkeypatch.setattr(
        load_core_data,
        "load_districts",
        lambda connection, path: calls.__setitem__("districts", calls["districts"] + 1) or 80,
    )
    monkeypatch.setattr(
        load_core_data,
        "load_schools",
        lambda connection, path: calls.__setitem__("schools", calls["schools"] + 1) or 1000,
    )
    monkeypatch.setattr(
        load_core_data,
        "load_auxiliary_layers",
        lambda connection: calls.__setitem__("aux", calls["aux"] + 1) or {},
    )
    monkeypatch.setattr(
        load_core_data,
        "load_default_layers",
        lambda connection: calls.__setitem__("layers", calls["layers"] + 1),
    )
    monkeypatch.setattr(sys, "argv", ["load_core_data.py", "--skip-schools"])

    load_core_data.main()

    assert calls == {"districts": 1, "schools": 0, "aux": 1, "layers": 1}
