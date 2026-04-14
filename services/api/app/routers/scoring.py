"""Routes for triggering and retrieving school scoring results."""

from __future__ import annotations

from fastapi import APIRouter

from ..db import get_db
from ..models.api import ScoringRunRequest
from ..repository import run_and_persist_scenario

router = APIRouter(prefix="/api/v1/scoring", tags=["scoring"])


def _payload_dict(model):
    return model.model_dump(exclude_none=True) if hasattr(model, "model_dump") else model.dict(exclude_none=True)


@router.post("/run")
def run_scoring_endpoint(payload: ScoringRunRequest):
    data = _payload_dict(payload)
    with get_db() as connection:
        return run_and_persist_scenario(
            connection,
            weight_overrides=data.get("weight_overrides"),
            config_overrides=data.get("config_overrides"),
            scenario_name=data.get("scenario_name"),
            description=data.get("description"),
            created_by=data.get("created_by"),
            persist=data.get("persist", True),
            is_default=data.get("is_default", False),
        )
