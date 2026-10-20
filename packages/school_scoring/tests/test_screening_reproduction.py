"""Reproduction of the frozen research outputs, school by school.

Runs only when the reference folder and the raw data folder are available:

    RISE_PNG_REFERENCE_ROOT=<.audit-work/methodology> RISE_PNG_DATASETS_ROOT=<datasets> pytest -m reproduction

The report is written to ``RISE_PNG_REPRODUCTION_OUTPUT``, which defaults to
``<reference root>/../reproduction/screening-engine-20261020``.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
from screening_reproduction import run_reproduction

pytestmark = pytest.mark.reproduction


def test_engine_reproduces_frozen_outputs_school_by_school():  # FM1, FM2, FM4, FM6, FM7, FM8, FM9
    reference, datasets = os.environ.get("RISE_PNG_REFERENCE_ROOT"), os.environ.get("RISE_PNG_DATASETS_ROOT")
    if not (reference and datasets and Path(reference).is_dir() and Path(datasets).is_dir()):
        pytest.skip("set RISE_PNG_REFERENCE_ROOT and RISE_PNG_DATASETS_ROOT to run the reproduction check")
    default_output = Path(reference).resolve().parent / "reproduction" / "screening-engine-20261020"
    output = Path(os.environ.get("RISE_PNG_REPRODUCTION_OUTPUT", default_output))

    report = run_reproduction(Path(reference), Path(datasets), output)

    failing = {c["name"]: c["n_mismatch"] for c in report["checks"] if not c["passed"]}
    assert failing == {}, f"mismatching quantities (see {output / 'mismatching_rows.csv'})"
    assert report["agreement_by_cohort"] == {
        "all_records_212": {"schools": 212, "schools_with_no_mismatch": 212},
        "eligible_124": {"schools": 124, "schools_with_no_mismatch": 124},
        "complete_120": {"schools": 120, "schools_with_no_mismatch": 120},
        "interval_4": {"schools": 4, "schools_with_no_mismatch": 4},
    }
