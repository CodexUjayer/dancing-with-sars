# Data sources and provenance

All availability statements below were verified live on **2026-10-20** from
the development environment. Every dataset surfaced in the application
carries a machine-readable provenance record (see `ProvenanceRecord` in
`src/lib/science/types.ts`) with provider, product ID, acquisition times,
processing software, data class (real / synthetic / derived), source URL,
DOI, access notes and quality flags.

## 1. NISAR L2 GUNW — live catalog (NASA CMR)

| Field | Value |
|---|---|
| Collection | `NISAR_L2_GUNW_PROVISIONAL_V1` (also `NISAR_L2_GUNW_BETA_V1`) |
| Provider | NASA ASF DAAC (provider id `ASF`) |
| Content | Geocoded UNWrapped interferograms (L2) — the displacement product |
| Granules at verification | 90,974 (provisional) + 10,217 (beta) |
| Temporal span | 2025-10-29 → 2026-10-18 (12-day repeat pairs at the recent end) |
| Granule size | ~1–2.3 GB (HDF5) |
| Metadata access | Open, no authentication — CMR Search API |
| Science-file access | Requires free NASA Earthdata Login (302 redirect to urs.earthdata.nasa.gov) |
| Browse imagery | Open, no authentication — ASF Earthdata Cloud |

Endpoints used (both open):

- `https://cmr.earthdata.nasa.gov/search/granules.json?short_name=NISAR_L2_GUNW_PROVISIONAL_V1&bounding_box=...&temporal[]=...`
- `https://cmr.earthdata.nasa.gov/search/granules?short_name=...` (HEAD, for hit counts)

The application uses CMR for the availability panel and the
"acquisition pair brackets the event" detection (`bracketsEvent`:
`timeStart < eventTime < timeEnd`). Live queries are proxied through
`/api/external/cmr` with timeouts and explicit error surfacing.

## 2. NISAR sample GUNW product (quantitatively analysed)

The openly distributed NISAR sample product analysed end-to-end:

| Field | Value |
|---|---|
| Granule | `NISAR_L2_PR_GUNW_001_030_A_019_002_2000_SH_20081012T060911_20081012T060925_20081127T061000_20081127T061014_D00404_N_F_J_001` |
| Source | https://nisar.jpl.nasa.gov/data/sample-data/ (open access) |
| Local copy | `data/nisar-sample/…h5` (264 MB, verified MD5-intact download) |
| Sensor | ALOS PALSAR L-band data, processed through the NISAR SDS **v0.24.0** (processing date 2025-01-29) |
| Scene | Los Angeles region (San Gabriel Mountains / Antelope Valley), frame 019, track 030, ascending |
| Pair | Reference 2008-10-12 06:09 UTC → Secondary 2008-11-27 06:10 UTC (46 days) |
| Grid | 1136 × 1555, EPSG:32611 (WGS84 / UTM 11N), 80 m posting |
| Radar | λ = 0.2360571 m (centre frequency 1,269,999,750.06 Hz), incidence 19.3–28.9°, 17×7 = 119 looks |
| DOI | 10.5067/NIL2GUNW-B1 (recorded in-file) |
| Product spec | v1.2.1; unwrapping: SNAPHU; flattening: with geometry offsets |
| Corrections applied upstream | topographic + ellipsoidal flattening, ionospheric (range+azimuth), hydrostatic + wet tropospheric — all read from product metadata and displayed |
| Ionospheric screen uncertainty | robust median 4.31 rad ≈ 81 mm (spatially correlated systematic → detection floor) |

**Extraction** is lossless and reproducible:
`python3 tools/extract_gunw.py <product.h5> <outdir> --slug …` writes
`phase.f32`, `coherence.f32`, `components.u16` plus a complete `meta.json`
(grid, radar geometry derived from the product's own LOS unit vectors,
identification, processing flags, statistics). The derived dataset lives in
`data/derived/nisar-la-2008/`. All scientific interpretation happens in the
TypeScript pipeline; the extractor performs no science.

## 3. Panama M7.7 earthquake evidence (2026)

| Field | Value |
|---|---|
| Event | USGS `us6000u18k`, Mww **M 7.7** |
| Time | 2026-10-09T17:56:06 UTC |
| Location | 7.5868°N, 80.769°W (12 km WSW of Pitaloza Arriba, Panama), depth 12.6 km |
| Moment tensor | strike 25.21°, dip 74.77°, rake −155.3° (dextral-oblique), M0 = 3.77×10²⁰ N·m — `us/us_6000u18k_mww` |
| NISAR coverage | 14 GUNW granules whose acquisition pairs bracket the event (CMR spatial+temporal query, verified 2026-10-20) |
| Primary granule | `NISAR_L2_PR_GUNW_031_141_D_085_032_4000_SH_20260927T235335_…_20261009T235335_…` — 2026-09-27 → 2026-10-09 (second pass ~6 h after the mainshock), footprint contains the epicentre |
| Browse imagery | 3 official SDS LATLON renderings downloaded (open access) to `data/nisar-browse/`, served via `/api/external/browse` with strict filename validation |

Cached records: `data/derived/panama-2026/usgs_event.json` (event + moment
tensor, from the live USGS detail endpoint) and `granules.json` (CMR
records). **Honest limitation, displayed in the UI:** the full HDF5
products require NASA Earthdata credentials, which this deployment does not
hold — so MOTUS presents the real availability, official imagery and a
labelled Okada forward model, and explicitly does not present a measured
displacement field for this event.

## 4. USGS ComCat (FDSN) earthquake catalog

| Field | Value |
|---|---|
| Service | https://earthquake.usgs.gov/fdsnws/event/1/ (open, no auth) |
| Use | Independent seismic evidence for attribution; moment-tensor nodal planes for forward modelling |
| Observed latency | 15–25 s per time-range query under load; intermittent 502s (measured 2026-10-20) |
| Mitigation | 35 s timeout, one retry, 15-minute in-memory response cache; honest degradation message on failure |

The client parses each event's `products["moment-tensor"]` for nodal-plane-1
strike/dip/rake and the event magnitude is taken from the `mww`-derived
property. Events are attributed to an analysis only when their origin time
falls strictly inside the acquisition window (reference → secondary) and
within 400 km of the dataset centre.

## 5. Synthetic validation fixtures

Generated in-process by `src/lib/science/fixtures.ts` from the Okada85
forward model with an explicit observation-simulation chain (LOS projection
→ phase conversion → coherence-consistent Gaussian noise → smooth
atmospheric ramp → decorrelation patches). Deterministic (mulberry32
seeds). Three fixtures: dextral strike-slip (seed 20261009), thrust
(seed 88001), null (seed 424242). Every fixture is labelled `dataClass:
synthetic` in provenance, badged in the UI, and excluded from any claim
about the real Earth.

## 6. Map tiles

Base map tiles: Esri World_Topo via the ArcGIS Online tile service
(keyless, clean at time of verification). CARTO basemaps were rejected
during development because they now serve "API KEY REQUIRED" watermarked
tiles without a key; this was caught by visual inspection of the rendered
map, not assumed.

## 7. Provenance model

Every dataset loaded by the registry produces a `ProvenanceRecord`:

```
provider, productId, productType, platform,
referenceTime, secondaryTime, temporalBaselineDays,
processingTime?, processingSoftware?,
dataClass ('real' | 'synthetic' | 'derived'),
sourceUrl, doi?, accessNotes?, qualityNotes[]
```

These fields are surfaced in the UI (dataset panel + expandable full
provenance block), returned by `GET /api/datasets/[id]`, and the quality
flags are copied verbatim from the product metadata (corrections applied,
no-data fractions, multilooking). Run-level provenance (parameters,
summaries, durations) is persisted in the `AnalysisRun` table for audit.

## 8. Access policy and credentials

No credentials exist in this repository. The documented path for
authenticated NISAR HDF5 ingestion is the `EARTHDATA_BEARER_TOKEN`
environment variable (see `.env.example`); the adapter is not exercised in
this deployment and the UI states that evidence mode is a fallback for
exactly this reason.
