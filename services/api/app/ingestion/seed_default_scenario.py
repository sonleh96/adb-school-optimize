"""CLI utility for seeding the default scoring scenario in the database."""

from __future__ import annotations

import argparse

from ..db import get_db
from ..repository import run_and_persist_scenario
from ..settings import get_settings


def main() -> None:
    parser = argparse.ArgumentParser(description="Run scoring on the loaded schools table and persist a default scenario.")
    parser.add_argument("--scenario-name", default="Default Methodology")
    parser.add_argument("--description", default="Default scenario seeded from notebook methodology.")
    parser.add_argument("--created-by", default="system")
    args = parser.parse_args()

    settings = get_settings()
    with get_db(settings) as connection:
        result = run_and_persist_scenario(
            connection,
            scenario_name=args.scenario_name,
            description=args.description,
            created_by=args.created_by,
            persist=True,
            is_default=True,
        )

    scenario = result["scenario"] or {}
    print(f"Seeded scenario {scenario.get('scenario_id')} ({scenario.get('scenario_name')}).")


if __name__ == "__main__":
    main()
