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

- `png-provinces.svg`: Papua New Guinea's 22 provinces, drawn from World Bank Official Boundaries, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).
  Source: version 2 of the dataset at https://datacatalog.worldbank.org/search/dataset/0038272, its file `World Bank Official Boundaries - Admin 1.geojson` (254,535,760 bytes, SHA-256 `2cd52d0ebea4889850471597c84222eeb817bc0077ac9d49bbcfed7d5faac2b6`), downloaded on 5 November 2026.
  `apps/web/scripts/build-province-map.mjs` draws this file from it, and its header gives the download command; run on that file, it writes this one byte for byte.
  Each province is one path, with its World Bank code as its id and its name in `data-name`.
  The boundaries shown do not imply any judgement on the legal status of any territory.
  Simplified and redrawn, with small islands left out; it shows no school or mark.
  The homepage shows it faintly, and the explore page shades its provinces by the schools of the top 20 their records name.
  Both pages show the credit "Boundaries: World Bank Official Boundaries, CC BY 4.0.", linked to the dataset's page.
  Provenance: the repository's `datasets/PNG_provinces.geojson`, which the first version of this file was drawn from and which is not committed, holds the same 22 features as that version 2 file, geometry for geometry.
  Version 3 of the dataset (21 October 2026) has the same 22 names and codes with redrawn lines; the map stays on version 2, the one the repository's boundary file came from.
  Natural Earth, which is public domain, was checked first, but its admin-1 layer (version 5.2.0-pre on 4 November 2026) has 20 of the country's provinces, without Hela and Jiwaka.

## Screenshots

- `tool-desktop.webp`, `tool-phone.webp`, `tool-phone-rows.webp`: screenshots of RISE-PNG showing the synthetic test data in `apps/web/e2e/fixtures/screening`, not real schools.
  `tool-phone-rows.webp` is a crop of `tool-phone.webp`: the list's first two rows and their Why lines, which the hero shows on a phone.
  Made by the project, so the MIT licence covers them.
  The tests' basemap has no tiles, so no OpenStreetMap or CARTO data appears in them.
  The desktop shot is cropped above the map's credit line, which would name a basemap the picture does not show.

## ADB material

- ADB's logo, drawn by `components/AdbLogo.tsx` and `app/icon.svg`, is the Asian Development Bank's and is not covered by the MIT licence.
  No written permission from ADB to use it is recorded in this repository.
- No ADB photograph is used: ADB's photo library is all rights reserved.
