"""The repository is public: committed prose must not carry counts that are derived from the school data."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[3]
DOCS = (
    "packages/school_scoring/README.md",
    "packages/school_scoring/tests/FAILURE_MODES.md",
    "services/api/README.md",
    "services/api/tests/SCREENING_API_FAILURE_MODES.md",
    "services/api/tests/SCREENING_DB_FAILURE_MODES.md",
    "GLOSSARY.md",
)
# Cohort sizes of the frozen study and the number of rule pairs it compares.
DERIVED_COUNTS = re.compile(r"\b(212|124|120|88)\b|\b21 pairs\b")


@pytest.mark.parametrize("relative", DOCS)
def test_committed_docs_hold_no_counts_derived_from_the_school_data(relative):  # FM14
    path = ROOT / relative
    assert path.is_file(), relative
    found = [
        (number, line.strip()[:80])
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if DERIVED_COUNTS.search(line)
    ]
    assert found == []
