# MOTUS — Earth-change intelligence from spaceborne radar

**NASA Space Apps Challenge 2026 · Challenge: "Dancing with the SARs"**

MOTUS measures how the Earth's surface moved between two radar satellite
acquisitions, quantifies the uncertainty of that measurement, screens
candidate physical explanations against independent evidence, and shows its
work at every step. It is built around real NISAR mission data products and
live NASA/USGS services.

What makes it scientifically defensible rather than merely functional:

- **Verified conventions, not assumed ones.** The phase→displacement sign
  convention is taken from the official NISAR SDS Algorithm Theoretical Basis
  Document (JPL D-95677 §5.7/§5.11.1) and stated in the UI; the LOS
  unit-vector reconstruction is checked against the actual product's stored
  radarGrid vectors.
- **A benchmarked physics engine.** The Okada (1985) elastic dislocation
  port matches the official DC3D reference implementation to better than
  10⁻⁸ relative error over 24 benchmark geometries × 3 slip modes, and its
  fault-geometry conventions were calibrated against analytic solutions
  (a placement bug caught this way is now a permanent regression test).
- **Honest uncertainty.** Coherence-based phase noise (Rodríguez & Martín
  1992), robust reference-region scatter, and the product's ionospheric
  systematic floor all enter the detection rule. The 2008 sample product
  correctly yields a *negative* result because its ~81 mm ionospheric floor
  exceeds the observed residual signal — the system says so plainly.
- **Attribution that knows its limits.** Candidate explanations carry
  evidence-linked statuses (supported / consistent / plausible /
  insufficient-evidence / not-supported). When a USGS catalogued earthquake
  falls inside the acquisition window, an Okada forward model built from the
  published moment tensor is compared with the measurement — as a
  consistency screen, never as a probability of causation.
- **Real data, honestly labelled.** A real NISAR-format L-band interferogram
  (ALOS PALSAR over Los Angeles, processed by the NISAR SDS) is quantitatively
  analysed; the 2026 Panama M7.7 earthquake is presented with its real NISAR
  product availability, official browse imagery and a clearly labelled
  forward model (the full HDF5 download requires NASA Earthdata credentials,
  which this deployment does not hold — stated, not hidden). Synthetic
  validation fixtures are badged everywhere they appear.
- **Live services.** NASA CMR granule discovery and USGS ComCat seismicity
  are queried live (with caching, retries and honest degradation messages).
- **Traceability.** A 15-entry reference registry links every major claim to
  its source, with verification dates; every dataset carries a full
  provenance record.

## Quick start

Prerequisites: [Bun](https://bun.sh) ≥ 1.1 and network access (for live
NASA/USGS queries and map tiles).

```bash
bun install          # dependencies
bun run db:push      # create the SQLite schema (Prisma)
bun run dev          # start on http://localhost:3000
```

Run the validation suite and the linter:

```bash
bun test tests/      # 42 tests: science core, pipeline, geodesy, Okada benchmarks
bun run lint         # ESLint (Next.js rules)
```

## The demonstration flow

1. **Panama M7.7 — real evidence (default selection).** A magnitude-7.7
   earthquake struck Panama on 2026-10-09, between the acquisitions of real
   NISAR interferometric pairs. Explore the official SDS browse imagery, the
   granule catalogue with "spans event" badges, a live NASA CMR availability
   check, the USGS moment tensor, and an Okada forward model of the expected
   deformation — labelled as a prediction, not a measurement.
2. **Los Angeles 2008 — real measurement.** A genuine NISAR-format L-band
   unwrapped interferogram (46-day pair) analysed end-to-end: displacement
   map with uncertainty, coherence and σ layers, detection statistics and
   attribution. The honest outcome is "no motion above this product's
   ionospheric systematic floor" — with the numbers to back it up.
3. **Synthetic validation lab.** Three deterministic fixtures (dextral
   strike-slip, thrust, null) with analytic Okada ground truth. The pipeline
   recovers the deformation to ~2.6 mm MAE and produces zero false alarms on
   the null fixture — the numbers are shown next to each result.

## Repository map

```
src/lib/science/     Scientific core (pure TypeScript)
  phase.ts             NISAR phase↔displacement convention
  okada.ts             Okada 1985 DC3D port + moment/area scaling
  uncertainty.ts       Coherence-based σ (Rodríguez & Martín 1992)
  detection.ts         Significance rule + summary statistics
  attribution.ts       Evidence-linked hypothesis screen + forward model
  pipeline.ts          Stages A–E orchestrator
  fixtures.ts          Deterministic synthetic validation fixtures
  utm.ts, statistics.ts, los-projection.ts, validation.ts, types.ts, constants.ts
src/lib/data/        Data layer: dataset registry, CMR + USGS clients, references
src/app/api/         REST API (analyses, datasets, external CMR/USGS/browse, references)
src/app/page.tsx     The single-page application
src/components/app/  UI: Mercator-exact raster rendering, map, results, methodology
tools/               extract_gunw.py (HDF5→derived layers), dc3d_reference.py (benchmark source)
data/                Real products: NISAR sample HDF5, browse imagery, derived layers
tests/science/       42 automated validation tests
docs/                Science, data sources, methodology, validation, architecture,
                     limitations, references
prisma/schema.prisma AnalysisRun + Reference models (SQLite)
```

## Documentation

- [docs/science.md](docs/science.md) — foundations, equations, conventions, limitations
- [docs/data-sources.md](docs/data-sources.md) — every dataset and service, with provenance
- [docs/methodology.md](docs/methodology.md) — the end-to-end processing pipeline
- [docs/validation.md](docs/validation.md) — test inventory, benchmarks, what is and is not validated
- [docs/architecture.md](docs/architecture.md) — modules and data flow
- [docs/limitations.md](docs/limitations.md) — the honest list
- [docs/references.md](docs/references.md) — annotated bibliography

## Scope statement

MOTUS is a scientific demonstration for the NASA Space Apps Challenge 2026,
not an operational service. It processes one interferogram at a time, in one
viewing geometry, and its attribution layer is a transparent rule-based
screen. Synthetic fixtures are clearly labelled and are not Earth
observations. See docs/limitations.md for the complete list.
