# python:3.11-slim (3.11.15-slim-trixie, multi-arch index digest, resolved 2026-08-09)
FROM python:3.11-slim@sha256:90744cff8f32887f075c47d747a173ff333e9e98801667af93c357fa9f5e28ff

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    gdal-bin \
    libgdal-dev \
    libproj-dev \
    && rm -rf /var/lib/apt/lists/*

COPY packages/school_scoring /app/packages/school_scoring
COPY services/api /app/services/api

RUN pip install --upgrade pip && \
    pip install -e /app/packages/school_scoring && \
    pip install --no-deps -e /app/services/api && \
    pip install -r /app/services/api/requirements.lock && \
    python -c "import numpy; import rasterio; from google.cloud import storage"

WORKDIR /app/services/api

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
