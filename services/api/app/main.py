from __future__ import annotations

from fastapi import FastAPI

from .models.api import HealthResponse
from .routers.districts import router as districts_router
from .routers.exports import router as exports_router
from .routers.meta import router as meta_router
from .routers.rasters import router as rasters_router
from .routers.scenarios import router as scenarios_router
from .routers.schools import router as schools_router
from .routers.scoring import router as scoring_router

app = FastAPI(title="RISE-PNG API", version="0.1.0")

app.include_router(meta_router)
app.include_router(schools_router)
app.include_router(districts_router)
app.include_router(scenarios_router)
app.include_router(scoring_router)
app.include_router(exports_router)
app.include_router(rasters_router)


@app.get("/healthz", response_model=HealthResponse, tags=["health"])
def healthz() -> HealthResponse:
    return HealthResponse(status="ok")
