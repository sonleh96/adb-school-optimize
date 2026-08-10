"""Routes for listing and managing scoring scenarios."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..db import get_db
from ..models.api import ScenarioCreate, ScenarioUpdate
from ..repository import fetch_scenario, fetch_scenarios, insert_scenario, update_scenario
from ..security import (
    CurrentUser,
    require_write_operations,
    require_write_rate_limit,
)

router = APIRouter(prefix="/api/v1/scenarios", tags=["scenarios"])


def _payload_dict(model):
    return (
        model.model_dump(exclude_none=True) if hasattr(model, "model_dump") else model.dict(exclude_none=True)
    )


@router.get("")
def list_scenarios():
    with get_db() as connection:
        return fetch_scenarios(connection)


@router.post("")
def create_scenario(
    payload: ScenarioCreate,
    user: CurrentUser,
    _write_access: None = Depends(require_write_operations),
    _rate_limit: None = Depends(require_write_rate_limit),
):
    data = _payload_dict(payload)
    data["created_by"] = user.actor
    with get_db() as connection:
        return insert_scenario(connection, data)


@router.get("/{scenario_id}")
def get_scenario(scenario_id: str):
    with get_db() as connection:
        scenario = fetch_scenario(connection, scenario_id)
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario


@router.patch("/{scenario_id}")
def patch_scenario(
    scenario_id: str,
    payload: ScenarioUpdate,
    user: CurrentUser,
    _write_access: None = Depends(require_write_operations),
    _rate_limit: None = Depends(require_write_rate_limit),
):
    data = _payload_dict(payload)
    data["created_by"] = user.actor
    try:
        with get_db() as connection:
            scenario = update_scenario(connection, scenario_id, data)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario
