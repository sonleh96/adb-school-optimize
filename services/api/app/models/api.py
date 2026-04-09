from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str


class ScenarioCreate(BaseModel):
    scenario_name: str
    description: str | None = None
    weights: dict[str, Any]
    config: dict[str, Any] | None = None
    created_by: str | None = None
    is_default: bool = False


class ScenarioUpdate(BaseModel):
    scenario_name: str | None = None
    description: str | None = None
    weights: dict[str, Any] | None = None
    config: dict[str, Any] | None = None
    created_by: str | None = None
    is_default: bool | None = None


class ScoringRunRequest(BaseModel):
    scenario_name: str | None = None
    description: str | None = None
    weight_overrides: dict[str, Any] | None = None
    config_overrides: dict[str, Any] | None = None
    persist: bool = True
    created_by: str | None = None
    is_default: bool = False


class SchoolFilters(BaseModel):
    province: str | None = None
    district: str | None = None
    scenario_id: str | None = None
    limit: int = Field(default=500, ge=1, le=5000)
