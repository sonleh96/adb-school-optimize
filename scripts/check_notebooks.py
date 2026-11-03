#!/usr/bin/env python3
"""Fail when a tracked Jupyter notebook carries saved outputs.

Saved outputs once put real school data into this public repo, and the review
of each pull request never saw them. This check runs in CI and can run locally.

With no arguments it checks every notebook that `git ls-files '*.ipynb'` lists.
Pass paths to check those files instead.

A notebook fails when any of these hold:
  - it is not valid UTF-8 JSON, or has no `cells` list (an old nbformat);
  - a cell has non-empty `outputs`;
  - a cell has a non-null `execution_count`;
  - a code cell's `metadata` has a field that records or hides output.

Messages name the file and the cell index (0-based). They never print cell
content, because the content is what we are keeping out of the logs.

Exit codes: 0 clean, 1 at least one notebook failed, 2 could not list files.
Fix a failing notebook with: jupyter nbconvert --clear-output --inplace <file>
"""

from __future__ import annotations

import json
import subprocess
import sys
from typing import Any

# Code-cell metadata that exists only because the cell ran or displayed output.
OUTPUT_METADATA_KEYS = (
    "collapsed",
    "scrolled",
    "ExecuteTime",
    "execution",
    "outputExpanded",
    "outputs",
)
# Under metadata.jupyter, only this key concerns output.
JUPYTER_OUTPUT_KEY = "outputs_hidden"

FIX_HINT = "jupyter nbconvert --clear-output --inplace <file>"


def check_text(text: str) -> list[str]:
    """Return one message per problem in the notebook JSON `text`."""
    try:
        nb = json.loads(text)
    except ValueError as exc:
        return [f"cannot parse as JSON ({exc.__class__.__name__})"]
    if not isinstance(nb, dict) or not isinstance(nb.get("cells"), list):
        return ["no top-level `cells` list (unsupported notebook format)"]

    problems: list[str] = []
    for index, cell in enumerate(nb["cells"]):
        if not isinstance(cell, dict):
            problems.append(f"cell {index}: not a JSON object")
            continue
        problems.extend(_check_cell(index, cell))
    return problems


def _check_cell(index: int, cell: dict[str, Any]) -> list[str]:
    kind = cell.get("cell_type", "unknown")
    where = f"cell {index} ({kind})"
    problems: list[str] = []

    outputs = cell.get("outputs")
    if outputs:  # [] and a missing key are clean; anything else is not.
        count = len(outputs) if isinstance(outputs, list) else 1
        problems.append(f"{where}: non-empty outputs ({count})")

    if cell.get("execution_count") is not None:  # 0 is a saved run too.
        problems.append(f"{where}: execution_count is not null")

    if kind == "code":
        metadata = cell.get("metadata")
        if isinstance(metadata, dict):
            found = [key for key in OUTPUT_METADATA_KEYS if key in metadata]
            jupyter = metadata.get("jupyter")
            if isinstance(jupyter, dict) and JUPYTER_OUTPUT_KEY in jupyter:
                found.append(f"jupyter.{JUPYTER_OUTPUT_KEY}")
            if found:
                problems.append(f"{where}: output-like metadata ({', '.join(found)})")
    return problems


def check_file(path: str) -> list[str]:
    try:
        with open(path, "rb") as handle:
            text = handle.read().decode("utf-8")
    except UnicodeDecodeError:
        return ["cannot read as UTF-8"]
    except OSError as exc:
        return [f"cannot read file ({exc.__class__.__name__})"]
    return check_text(text)


def tracked_notebooks() -> list[str]:
    result = subprocess.run(["git", "ls-files", "-z", "--", "*.ipynb"], capture_output=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.decode("utf-8", "replace").strip() or "git ls-files failed")
    return [name for name in result.stdout.decode("utf-8").split("\0") if name]


def main(argv: list[str]) -> int:
    try:
        paths = argv or tracked_notebooks()
    except (OSError, RuntimeError) as exc:
        print(f"check_notebooks: cannot list notebooks: {exc}", file=sys.stderr)
        return 2

    failed = 0
    for path in paths:
        problems = check_file(path)
        for problem in problems:
            print(f"{path}: {problem}")
        failed += bool(problems)

    if failed:
        print(f"\n{failed} notebook(s) have saved outputs or run state. Fix with: {FIX_HINT}")
        return 1
    print(f"check_notebooks: {len(paths)} notebook(s) clean")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
