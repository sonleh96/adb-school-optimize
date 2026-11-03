"""The school loader against a real database with an invented school.

Failure mode: the loader leaves a database pool open behind it. The pool keeps a connection on the server and four
threads in the process, and at exit the interpreter waits up to 5 s for those threads and warns that it "couldn't
stop thread" for any that do not stop.
"""

from __future__ import annotations

import json
import sys
import threading
from pathlib import Path

import pandas as pd
from app.ingestion import load_core_data
from app.settings import get_settings


def _write_inputs(folder: Path) -> tuple[Path, Path]:
    schools = folder / "schools.csv"
    pd.DataFrame(
        [
            {
                "School Name": "Kareba Invented High School",
                "Province": "Province One",
                "District": "District One",
                "Locality": "Remote",
                "Latitude": -9.0,
                "Longitude": 147.0,
            }
        ]
    ).to_csv(schools, index=False)
    districts = folder / "districts.geojson"
    districts.write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"Province": "Province One", "District": "District One"},
                        "geometry": {
                            "type": "Polygon",
                            "coordinates": [
                                [[146.0, -10.0], [148.0, -10.0], [148.0, -8.0], [146.0, -8.0], [146.0, -10.0]]
                            ],
                        },
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    return schools, districts


def _pool_threads() -> list[str]:
    return [t.name for t in threading.enumerate() if t.name.startswith("pool-")]


def test_loader_leaves_no_connection_or_pool_thread_behind(
    connection, database_url, tmp_path, monkeypatch, capsys
):
    schools, districts = _write_inputs(tmp_path)
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setattr(
        sys, "argv", ["load_core_data", "--schools", str(schools), "--districts", str(districts)]
    )
    get_settings.cache_clear()
    before = _pool_threads()
    try:
        load_core_data.main()
    finally:
        get_settings.cache_clear()

    assert "Loaded 1 schools." in capsys.readouterr().out
    assert connection.execute("select count(*) from schools").fetchone()[0] == 1
    others = connection.execute(
        "select count(*) from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid()"
    ).fetchone()[0]
    assert others == 0
    assert _pool_threads() == before
