"""Check that a running API's additive_u list on the paper's input version reproduces EXP-21.

Usage: python services/api/scripts/check_exp21.py <api base url> <EXP-21 results dir> <output json>

The results dir is `experiments/decision_rules/EXP-21-v0.1.0-20261012/results` under the methodology reference root.
Reads the API over HTTP and the frozen EXP-21 tables, and writes only the report. Exits 1 on any mismatch.
Scores within 1e-12 absolute; ranks, cohorts, school set and persistence flags exactly;
top-20 frequencies exactly as stored floats.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.request
from pathlib import Path

import pandas as pd

VERSION = "paper-2026-10-12"
TOL = 1e-12
COHORT = {
    "complete point cohort": "complete",
    "evidence-eligible interval cohort": "interval",
    "interval-only eligible cohort": "interval",
    "condition-ineligible verification queue": "verification_queue",
}


def num(value):
    if value is None:
        return None
    value = float(value)
    return None if math.isnan(value) else value


def main(base: str, ref: Path, out: Path) -> int:
    url = f"{base.rstrip('/')}/api/v1/screening/results?rule=additive_u&input_version={VERSION}"
    with urllib.request.urlopen(url, timeout=120) as response:
        body = json.load(response)
    rows = {r["school"]["source_school_name"]: r for r in body["rows"]}
    table = pd.read_csv(ref / "all_school_results.csv", float_precision="round_trip")
    persistence = pd.read_csv(ref / "persistent_investigation_candidates.csv", float_precision="round_trip")
    receipt = json.loads((ref / "run_receipt.json").read_text())

    mismatches: list[dict] = []
    checked = 0

    def check(school, field, api, want, exact):
        nonlocal checked
        checked += 1
        api, want = (num(api), num(want)) if not isinstance(want, str) else (api, want)
        if api is None or want is None:
            ok = api is None and want is None
        elif exact:
            ok = api == want
        else:
            ok = abs(api - want) <= TOL
        if not ok:
            mismatches.append({"school": school, "field": field, "api": api, "reference": want})

    names = set(table["School Name"])
    if names != set(rows):
        mismatches.append(
            {
                "field": "school set",
                "only_api": sorted(set(rows) - names)[:5],
                "only_reference": sorted(names - set(rows))[:5],
            }
        )
    for rec in table.to_dict("records"):
        name = rec["School Name"]
        row = rows.get(name)
        if row is None:
            continue
        check(name, "cohort", row["cohort"], COHORT[rec["cohort_class"]], True)
        for side in ("lower", "upper", "point"):
            check(name, f"score_{side}", row["scores"][side], rec[f"score_{side}"], False)
        bounds = row.get("rank_bounds") or {}
        check(name, "rank_min_possible", bounds.get("best"), rec["rank_min_possible"], True)
        check(name, "rank_max_possible", bounds.get("worst"), rec["rank_max_possible"], True)
        check(name, "rank_point", (row.get("point_rank") or {}).get("rank"), rec["rank_point"], True)

    for rec in persistence.to_dict("records"):
        name = rec["School Name"]
        row = rows.get(name)
        if row is None:
            mismatches.append({"school": name, "field": "persistence school missing from API"})
            continue
        freqs = {f["setting_id"]: f["frequency"] for f in row["top20_frequencies"]}
        for setting in ("concentration_20_15", "concentration_40_35", "concentration_100_80"):
            check(name, setting, freqs.get(setting), rec[setting], True)
        checked += 1
        if bool(row["persistent_candidate"]) != bool(rec["persistent_at_0_80_all_settings"]):
            mismatches.append({"school": name, "field": "persistent_candidate"})

    flagged = sum(1 for r in rows.values() if r.get("persistent_candidate"))
    want_flagged = receipt["persistent_investigation_count_at_0_80_all_settings"]
    checked += 1
    if flagged != want_flagged:
        mismatches.append({"field": "persistent count", "api": flagged, "reference": want_flagged})

    report = {
        "api": url,
        "run": body["run"],
        "persistence_experiment": (body.get("persistence") or {}).get("experiment_id"),
        "persistence_source_sha256": (body.get("persistence") or {}).get("source_sha256"),
        "schools_api": len(rows),
        "schools_reference": len(table),
        "persistent_schools": flagged,
        "values_checked": checked,
        "mismatches": len(mismatches),
        "first_mismatches": mismatches[:20],
        "passed": not mismatches,
    }
    out.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    print(json.dumps({k: v for k, v in report.items() if k != "first_mismatches"}, indent=2, sort_keys=True))
    return 0 if not mismatches else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3])))
