# Cloud Run

Deployment placeholder for the Python backend and raster processing workloads.

Expected deployable unit:
- `services/api`

Cloud Run is used because runtime raster clipping and GDAL/rasterio processing are a poor fit for Vercel serverless functions.
