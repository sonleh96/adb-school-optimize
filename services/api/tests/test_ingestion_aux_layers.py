from __future__ import annotations

import json

from app.ingestion.load_core_data import _csv_point_vector_records, _geojson_vector_records


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
