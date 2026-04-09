from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..db import get_db
from ..models.api import ScenarioCreate, ScenarioUpdate
from ..repository import fetch_scenario, fetch_scenarios, insert_scenario, update_scenario

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


def _payload_dict(model):
    return model.model_dump(exclude_none=True) if hasattr(model, "model_dump") else model.dict(exclude_none=True)


@router.get("")
def list_scenarios():
    with get_db() as connection:
        return fetch_scenarios(connection)


@router.post("")
def create_scenario(payload: ScenarioCreate):
    with get_db() as connection:
        return insert_scenario(connection, _payload_dict(payload))


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str):
    with get_db() as connection:
        scenario = fetch_scenario(connection, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.patch("/{scenario_id}")
def patch_scenario(scenario_id: str, payload: ScenarioUpdate):
    with get_db() as connection:
        scenario = update_scenario(connection, scenario_id, _payload_dict(payload))
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario
