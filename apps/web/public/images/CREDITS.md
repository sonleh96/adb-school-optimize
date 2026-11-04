# Image credits

The MIT licence in this repository covers the code.
It does not cover the images listed here, which keep their own licences.
The homepage shows each outside credit in its footer, linked to the source.

## Satellite image

- `png-from-orbit.webp`: NASA Blue Marble Next Generation, via NASA World Wind.
  Public domain.
  Source: https://commons.wikimedia.org/wiki/File:Papua_New_Guinea_BMNG.png.
  Image courtesy of NASA; NASA does not endorse this site.
  Cropped at the left edge to remove the border line, resized, turned grey and toned to ADB navy.
  Credit shown on the homepage: "Image: NASA Blue Marble Next Generation, via Wikimedia Commons."

## Map

- `png-provinces.svg`: drawn from World Bank Official Boundaries, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Source: https://datacatalog.worldbank.org/search/dataset/0038272.
  The boundaries shown do not imply any judgement on the legal status of any territory.
  Simplified and redrawn, with small islands left out; it shows no school, mark or name.
  Credit shown on the homepage: "Boundaries: World Bank Official Boundaries, CC BY 4.0."
  Provenance gap: the file it was drawn from, `datasets/PNG_provinces.geojson`, is not in this repository, and no record says where it came from.
  Its fields (`WB_A3`, `WB_STATUS`, `GEOM_SRCE: "WB GAD"`) point to the World Bank dataset above.
  Natural Earth, which is public domain, was checked first, but its admin-1 layer (version 5.2.0-pre on 4 November 2026) has 20 of the country's provinces, without Hela and Jiwaka.

## Screenshots

- `tool-desktop.webp`, `tool-phone.webp`: screenshots of RISE-PNG showing the synthetic test data in `apps/web/e2e/fixtures/screening`, not real schools.
  Made by the project, so the MIT licence covers them.
  The tests' basemap has no tiles, so no OpenStreetMap or CARTO data appears in them.
  The desktop shot is cropped above the map's credit line, which would name a basemap the picture does not show.

## ADB material

- ADB's logo, drawn by `components/AdbLogo.tsx` and `app/icon.svg`, is the Asian Development Bank's and is not covered by the MIT licence.
  No written permission from ADB to use it is recorded in this repository.
- No ADB photograph is used: ADB's photo library is all rights reserved.
