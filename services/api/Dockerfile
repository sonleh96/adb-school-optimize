FROM python:3.11-slim

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
    pip install -e /app/services/api && \
    python -c "import numpy; import rasterio; from google.cloud import storage"

WORKDIR /app/services/api

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
