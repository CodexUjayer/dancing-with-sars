# Worklog — MOTUS: Earth-Change Intelligence System (NASA Space Apps 2026, "Dancing with the SARs")

Shared worklog for all agents. Append sections below with `---` separators per the template.

---
Task ID: 0
Agent: lead-architect
Task: Inspect repository, verify official challenge requirements, research data availability, design system architecture

Work Log:
- Inspected repository: bare Next.js 16 + Tailwind 4 + shadcn/ui scaffold (default page.tsx, hello-world /api, Prisma configured with SQLite at db/custom.db). No scientific code exists. Conventions to preserve: src/app structure, @/ alias, shadcn/ui components in src/components/ui, prisma schema location.
- Read uploaded PDF (/home/z/my-project/upload/): generic "interpreting vague research requests" document — NOT challenge-relevant. Ignored for science.
- Official challenge page https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/ is Cloudflare-blocked from this environment (documented as limitation; interpretation based on user brief).
- Current date: 2026-10-20 (verified via CMR response timestamps).
- Verified LIVE network access (all tested with curl):
  - NASA CMR search API (cmr.earthdata.nasa.gov): OPEN, no auth — 200 OK
  - USGS FDSN earthquake API (earthquake.usgs.gov): OPEN — v2.8.1
  - nisar.asf.earthdatacloud.nasa.gov (ASF cloudfront): browse PNGs OPEN (anonymous 200); .h5 science files redirect to Earthdata Login (302 → urs.earthdata.nasa.gov) — auth-gated
  - OSM/CARTO tiles reachable
- KEY DISCOVERY — real NISAR data is publicly indexed in NASA CMR (provider ASF):
  - NISAR_L2_GUNW_PROVISIONAL_V1: 90,974 granules (unwrapped geocoded interferograms), temporal span 2025-10-29 → 2026-10-18 (12-day pairs), ~1-2.3 GB per granule
  - Also indexed: NISAR_L2_GUNW_BETA_V1 (10,217), GSLC, GCOV, GOFF, RSLC, L3_SME2
- KEY DISCOVERY — 2026-10-09 M7.7 Panama earthquake (USGS us6000u18k, 7.5868°N -80.769°E, 12.6 km depth, 17:56 UTC): 14 real NISAR GUNW granules whose acquisition pairs bracket the event (verified via CMR spatial+temporal query). Frame 031_141_D_085 (2026-09-27→2026-10-09, second pass ~6h after mainshock) footprint polygon CONTAINS the epicenter.
- Downloaded real NISAR GUNW browse PNGs (official SDS renderings, open access) for 3 Panama-spanning granules → /home/z/my-project/data/nisar-browse/
- Downloaded official NISAR sample GUNW product (264 MB HDF5, openly accessible):
  /home/z/my-project/data/nisar-sample/NISAR_L2_PR_GUNW_001_030_A_019_002_2000_SH_20081012T060911...h5
  - REAL ALOS PALSAR L-band data over Los Angeles region, processed through the NISAR SDS v0.24.0 (2025-01-29), reference 2008-10-12, secondary 2008-11-27, 46-day baseline, frame 019 track 030 ascending, EPSG:32611, 80 m posting, 1555×1136 grid
  - Contains: unwrappedPhase (rad), coherenceMagnitude, connectedComponents (values 0,1,65535), ionospherePhaseScreen, wrappedInterferogram (complex), pixelOffsets, full orbit + radarGrid metadata (incidenceAngle 19.3–28.9°, LOS unit vectors, perp baseline -311 to -333 m)
  - centerFrequency 1269999750.06 Hz → λ = 0.2360571 m; looks 17 az × 7 rg = 119
  - All corrections documented as applied upstream: topographic + ellipsoidal flattening, ionospheric (range+azimuth), hydrostatic + wet tropospheric
  - Product DOI: 10.5067/NIL2GUNW-B1
  - QA summary CSV confirms NaN fraction 40.8% (mask/layover/incoherent)
- Downloaded official NISAR documents (open): L2 GUNW Product Specification (D-102272 RevE, Nov 2024) and L1/L2 ATBD (D-95677 RevA, Nov 2023) → data/nisar-sample/*.pdf, extracted text at *.txt
- SIGN CONVENTION VERIFIED from ATBD §5.7 (D-95677, p.52): interferogram = reference × conj(secondary), flattened via I×exp(−j(4π/λ)δr); phase decomposition Δφ = (4π/λ)(Δr_d + Δr_g + Δr_t + Δr_i + Δr_n). Under this convention (S = exp(−j4πR/λ)): φ = (4π/λ)·ΔR with ΔR = R_secondary − R_reference → LOS displacement d = λφ/(4π), POSITIVE = motion AWAY from the radar. This differs from the common d=−λφ/(4π) statement used when the conjugation order is reversed; documented explicitly in code + docs.
- Okada85 validation reference: fetched dc3d.py (github.com/satoshi-pes/dc3d.py), a faithful Python port of Okada's official DC3D Fortran (1991-93). Saved to /tmp/dc3d.py; will be vendored to tools/ for benchmarks. Also downloaded full product-spec and ATBD PDFs.
- Sandbox resources: 4.1 GB RAM (2.9 available), 7.9 GB disk free, Python 3.12 + h5py 3.15.1 available, bun available.

Stage Summary:
- Repository is a bare scaffold; nothing scientific to preserve.
- NISAR L2 GUNW data is real, public (metadata+browse open; H5 needs free Earthdata Login), and includes pairs bracketing a major 2026 M7.7 earthquake. 
- Architecture locked (see Task 1): Next.js single-page app + TS scientific pipeline (stages A–E) + derived-product data layer (Python h5py extractor for the real sample H5) + live CMR/USGS integrations + Okada85 synthetic validation fixtures generated in TS with dc3d-benchmarked math.
- Primary capability: LOS displacement measurement with uncertainty + change detection + transparent multi-hypothesis attribution. Complementary: live NISAR data-availability intelligence (CMR) cross-referenced with USGS seismicity.
- Product name: MOTUS (Latin: motion). UI: minimal warm-light scientific aesthetic, map-centric, no blue/indigo theme, sticky footer.

---
Task ID: 1
Agent: lead-architect
Task: Scientific core TypeScript modules

Work Log:
- Created src/lib/science/: types.ts, constants.ts, phase.ts, los-projection.ts, utm.ts, okada.ts
- types.ts: ScienceDataset, AnalysisParams, AnalysisResult, AttributionOutput, TransportGrid shared types
- phase.ts: phase↔displacement with NISAR SDS convention (d = λφ/(4π), + = away from radar), verified from ATBD D-95677 §5.7 (interferogram = reference × conj(secondary), flattening exp(−j4πδr/λ))
- los-projection.ts: LOS ENU unit vectors; VERIFIED against NISAR sample product radarGrid vectors (product stores satellite→ground = negative of ground→satellite; sample: losUnitVectorX=−0.4005, losUnitVectorY=−0.0837, incidence 24.17°, ascending — matches reconstruction to <0.01)
- okada.ts: full port of DC3D surface-displacement algorithm (dccon0/dccon2/ua/ub + corner loop). Slip-sense conventions determined EMPIRICALLY against dc3d.py: U1+ = sinistral, U2+ = normal-sense, U3+ = opening → rake mapping U1=slip·cos(rake), U2=−slip·sin(rake)
- CROSS-VALIDATION: TS port vs dc3d.py over 24 case×slip-mode combinations (varied dip 10–90°, depth, geometry incl. vertical + shallow-dipping faults): worst relative difference = 0.0 (agreement to 8 significant digits, 72 scalar comparisons). Benchmark cases captured for permanent test suite.
- Vendored reference: tools/dc3d_reference.py (Okada DC3D Python port, github.com/satoshi-pes/dc3d.py) for benchmark generation
- utm.ts: Snyder (1987) USGS PP1395 ch.8 transverse Mercator series, forward+inverse, EPSG 326xx/327xx

Stage Summary:
- Okada85 core is mathematically validated against the official DC3D algorithm lineage.
- Sign conventions for phase→displacement and LOS vectors are pinned to the NISAR product/documents, not assumed.
- Remaining: statistics/uncertainty/detection/attribution/validation/fixtures/pipeline modules.

---
Task ID: 2
Agent: lead-architect
Task: Data layer — Python extractor, derived products, external clients

Work Log:
- tools/extract_gunw.py: documented lossless extractor (HDF5 -> phase.f32/coherence.f32/components.u16 + meta.json with full provenance). Heading is derived from the product's own LOS unit vectors (sat2ground az -> ground2sat az -> heading = az-90 for right-look); the orbit-velocity approach was WRONG because velocities are ECEF, not ENU.
- Extracted the real NISAR sample product -> data/derived/nisar-la-2008/ (1136x1555, EPSG:32611, 119 looks, iono screen uncertainty median 4.31 rad)
- Saved Panama evidence records: data/derived/panama-2026/usgs_event.json (M7.7 us6000u18k with moment tensor strike 25.21/dip 74.77/rake -155.3, M0 3.77e20 N·m) + granules.json (3 CMR granule records incl. footprints + browse URLs)
- src/lib/data/: datasets.ts (registry: 5 datasets incl. 3 synthetic fixtures generated on demand), usgs.ts (FDSN client with moment-tensor parsing, 15-min TTL cache, 35s timeout + retry after observing 15-25s latencies and intermittent 502s), cmr.ts (CMR search client + bracketsEvent), references.ts (15-entry scientific registry)
- CRITICAL FINDING: NISAR product ionospherePhaseScreenUncertainty median ≈ 4.3 rad (~81 mm) — spatially correlated systematic. Pipeline treats it as a DETECTION FLOOR (not per-pixel noise); summary.systematicIonoFloorM + narrative expose it honestly.

Stage Summary:
- All data assets in place: real LA sample (quantitative), Panama evidence (metadata+browse+MT), 3 synthetic fixtures, live CMR/USGS clients.

---
Task ID: 3
Agent: lead-architect
Task: API routes + Prisma schema

Work Log:
- prisma/schema.prisma: AnalysisRun + Reference models (replaced unused User/Post scaffold), db:push OK
- API routes: /api (health/capabilities), /api/datasets, /api/datasets/[id] (provenance + evidence extras), /api/analyses POST (quantitative pipeline with live USGS cross-match; evidence mode with static event + live sequence + Okada prediction transport grid + honest narratives), /api/analyses/[id], /api/external/cmr (live, bracketsEvent flags), /api/external/usgs (live), /api/external/browse (path-traversal-guarded PNG serving), /api/references (DB mirror + registry)
- In-memory deterministic result cache keyed datasetId+params; DB persists every run for audit
- Smoke-tested ALL endpoints via curl: health OK, datasets OK (5), references OK (15), POST synthetic OK (runId, 1371.5 km² detected, validation MAE 2.59 mm), POST Panama OK (prediction grid 400x400, granules 3, MT parsed); /api/external/usgs OK after timeout fix (24s query, 60 events)

Stage Summary:
- Full backend live on port 3000. USGS latency handled with retry+cache; honest degradation messages verified.

---
Task ID: 4
Agent: lead-architect
Task: Automated validation tests

Work Log:
- tests/science/okada.test.ts: 24-case DC3D benchmark suite (worst rel diff < 1e-8), buried-fault 2D analytic calibration, slip-sense trace-jump tests (U2+ normal: hanging wall drops; U1+ sinistral; U3+ opening), far-field decay, moment/area scaling
- tests/science/core.test.ts: phase conventions (fringe=λ/2, round trips, wrap), LOS vectors (matches NISAR product vector < 0.02), coherence σ (known values, monotonicity, quadrature), robust statistics (median/MAD/planar fit/Pearson)
- tests/science/pipeline.test.ts: UTM round trips + sample-grid corner check vs footprint, Stage A validation rejections, null fixture false-alarm control (0 km² detected), strikeslip recovery (MAE < 10 mm asserted, actual 2.59 mm), real LA sample honesty (iono floor > 50 mm reported), threshold-rejection error, fixture determinism
- RESULT: 42 tests pass, 0 fail (234 expect calls, ~1.1 s). Lint clean.

Stage Summary:
- Science core fully test-verified. Okada port: exact agreement with the official DC3D algorithm lineage.

---
Task ID: 4b (debugging interlude)
Agent: lead-architect
Task: Okada fault-placement bug found and fixed via analytic calibration

Work Log:
- Symptom: synthetic fixture truth showed unphysical 67-90 m peaks near the fault trace.
- Diagnosis chain: (1) TS port matched dc3d.py EXACTLY on all benchmarks, so the port was faithful; (2) calibrated against the 2D screw-dislocation analytic solution — surface-breaking config matched theory to <1%; (3) decisive geometry tests showed DC3D's aw convention: POSITIVE aw extends UP-DIP from the reference point, so a buried fault with top edge at DEPTH must use aw = [-W, 0]. The friendly wrapper had used [0, +W], placing the fault ABOVE the surface into the air.
- Fix: wrapper now passes aw = [-fault.width, 0]; docstrings updated with the convention and the calibration story.
- Re-verified: buried strike-slip matches the 2D analytic solution within 1-10% (finite-length explains residual); slip senses re-confirmed via trace-jump tests on a near-surface-breaking steep fault (uz jump -0.93 for U2+ => normal sense); fixtures now produce physical fields (strikeslip LOS peaks ±0.14 m); pipeline MAE vs truth 2.6 mm.

Stage Summary:
- The kind of bug that silently corrupts science output was caught by insisting on analytic calibration rather than implementation-to-implementation agreement alone. Both the fix and the calibration tests are now permanent.

---
Task ID: 5 & 6 — delegated
Agent: lead-architect
Task: Launch frontend (Task 5, full-stack-developer) and documentation (Task 6, general-purpose) agents in parallel

Work Log:
- Wrote SPEC-FRONTEND.md (complete UI specification: design system, API contract, Mercator-exact raster rendering algorithm, panel specs, methodology drawer content, quality rules)
- Wrote SPEC-DOCS.md (README + 8 docs/ files + .env.example with all content sources and verified facts)
- Both agents instructed to read this worklog first and append their entries (Task IDs 5 and 6).

---
Task ID: 5
Agent: lead-architect (subagents were stuck; executed directly)
Task: Frontend UI implementation

Work Log:
- Installed leaflet + react-leaflet@5. Built under src/components/app/: types.ts (API contract), decode.ts (b64→Float32 transport decoding), colormap.ts (warm diverging terracotta↔teal displacement scale, coherence, σ scales), raster-render.ts (Mercator-exact raster warping: per-canvas-pixel Mercator inversion → UTM via Snyder series → nearest-neighbour grid sample → imageOverlay), map-panel.tsx (Leaflet map, footprint polygons, earthquake markers with tooltips, layer switcher, opacity slider, hover readout with lat/lon/value, legend, custom zoom controls), results-panel.tsx (narrative sections, stats strips, expandable hypothesis rows with status badges, forward-model block, validation block, warnings, events), methodology.tsx (drawer with equations, conventions, validation summary, live reference registry), evidence-viewer.tsx (official browse gallery with thumbnails+zoom, granule table with spans-event badges, live CMR check, USGS sequence), ui-bits.tsx (badges, stats, formatters)
- page.tsx: header with live status pills, intro strip, dataset card selector (5 cards), 2-column workspace (map + side panel), advanced parameter controls (coherence threshold, detection floor, k, reference strategy, detrend), run button with elapsed timer + USGS note, evidence/quantitative result modes, sticky footer with honest attribution
- layout.tsx: MOTUS metadata; next.config.ts: allowedDevOrigins
- BUGS FOUND & FIXED during browser verification:
  1. Turbopack corrupted cache → 500 on / — fixed by clearing .next and restarting dev server
  2. CARTO basemap now serves "API KEY REQUIRED" watermarked tiles — switched to ESRI World_Topo (keyless, clean, minimal)
  3. DOUBLE-SWAP BUG in FitBounds: footprint [lat,lon] was swapped again → map flew to the Southern Ocean near Antarctica; caught by VLM screenshot analysis + tile-coordinate forensics (tile 4/14/7 = 66°S!). Fixed; polygon now renders (M10 91L…), zoom 8 over Panama
  4. Added earthquake marker on dataset selection for evidence mode (was analysis-only)
- VERIFIED IN BROWSER (agent-browser + VLM): page loads clean (no console errors); dataset selection; synthetic-strikeslip analysis (1372 km², 135.7mm peak, MAE 2.59mm validation block); layer switching displacement/coherence/uncertainty with correct legends; methodology drawer (equations, 15 references from live API); Panama evidence mode (browse gallery, 3 granules with SPANS EVENT badges, live CMR check: "92 granules catalogue this region · 9 acquisition pairs bracket the event" — live NASA query, prediction overlay with "model · not a measurement" label); LA real dataset (honest 81mm-floor negative result, ~20-30s with live USGS cross-match); mobile 390px (no horizontal overflow, cards scroll, footer pinned exactly at viewport bottom when scrolled); desktop 1440px full-page VLM assessment: "clean, professional... successfully rendering... accurately representing the InSAR interferogram data"
- lint: 0 errors 0 warnings

Stage Summary:
- Complete single-page scientific application, all interactions browser-verified. Design: warm off-white minimal Apple-scientific, no blue/indigo, sticky footer, responsive, accessible (aria labels, keyboard focus, reduced-motion via CSS defaults).

---
Task ID: 6
Agent: lead-architect (executed directly)
Task: Documentation set

Work Log:
- README.md: project identity, defensibility bullet list, quick start (bun install/db:push/dev, bun test), demonstration flow (Panama → LA → synthetic lab), repository map, docs pointers, scope statement
- docs/science.md: measurement problem; NISAR phase convention verified from JPL D-95677 §5.7/§5.11.1 (incl. the contrast with the opposite conjugation convention); LOS geometry + product-vector verification; referencing strategies + failure modes; uncertainty model with worked σ table (Rodríguez & Martín); the ionospheric systematic floor reasoning; detection rule; Okada implementation lineage + benchmarks + slip-sense conventions + aw-convention finding; scaling relations + failure modes; attribution rules; geodesy; explicit non-claims
- docs/data-sources.md: every dataset/service with verified facts and dates — CMR collections (90,974+10,217 granules), the analysed sample granule (full metadata table), Panama event + 14 bracketing granules + primary frame, USGS API behaviour (latencies, retries, cache), fixtures, tiles (incl. the CARTO watermark finding), provenance model, access policy
- docs/methodology.md: stages A–E as implemented (validation gates, masking, referencing, offset removal, detrend caveat, summary metrics, uncertainty composition, detection, attribution, narrative generation, transport downsampling), defaults table, tooling
- docs/validation.md: full test inventory (42 tests, 234 assertions, all enumerated with what each proves), measured end-to-end results (strikeslip MAE 2.59 mm / RMSE 3.18 / bias −2.04; thrust; null zero-false-alarm; LA honest negative), explicit NOT-validated list, reproducibility
- docs/architecture.md: ASCII data-flow diagram, modes, persistence, external-service handling, browser georeferencing design, measured performance table
- docs/limitations.md: 15 numbered limitations with severity + resolution paths
- docs/references.md: all 15 registry entries grouped, each with what it supports, policy preamble, verification date
- .env.example: DATABASE_URL + documented optional EARTHDATA_BEARER_TOKEN path

Stage Summary:
- Complete documentation set with verified facts only; numbers cross-checked against test output and product metadata; honest gaps stated.

---
Task ID: 7
Agent: lead-architect
Task: Integration, final verification, and completion

Work Log:
- Final bugs found & fixed during the completion pass:
  1. /api/external/browse returned 404 despite the file existing — root cause: an em-dash in the X-Source HTTP header is not a latin-1 ByteString ("character at index 25"); replaced with a plain hyphen. All 3 official browse images now serve (200, 0.5–1.6 MB PNGs).
  2. Evidence-mode analyses response lacked granule.localBrowseUrl (only /api/datasets/[id] added it) — browse gallery rendered empty; fixed by adding localBrowseUrl in the analyses route.
  3. Server in-memory result cache served pre-fix responses until restart (documented behaviour); dev server restarted.
  4. One further Turbopack cache corruption after restart — cleared .next, restarted; stable since.
- Final verification (all green):
  - bun test: 42 pass / 0 fail / 234 assertions
  - bun run lint: 0 errors, 0 warnings
  - GET / 200; all API endpoints verified (health, datasets x5, references x15, panama detail with 3 granules + M7.7 event, browse PNGs, path-traversal attempt correctly 400)
  - Browser E2E (agent-browser + VLM): dataset selection; synthetic-strikeslip analysis (1372 km², +135.7 mm peak, MAE 2.59 mm validation block shown); LA real analysis (honest 81 mm-floor negative); Panama evidence mode (official browse gallery loads 4/4 at 1407×1384, granule table with SPANS EVENT badges, live CMR "92 granules · 9 bracketing pairs", USGS moment tensor, prediction overlay with "model · not a measurement" label); layer switching displacement/coherence/uncertainty with correct legends; methodology drawer with equations + 15 live references; mobile 390px (no overflow, footer pinned); desktop full-page VLM assessments positive.
- Removed the internal working spec files (SPEC-FRONTEND.md, SPEC-DOCS.md) — superseded by the implementation and docs/.

Stage Summary:
- MOTUS is complete: 5 datasets (1 real quantitative, 1 real evidence, 3 synthetic), full stages A–E pipeline, live NASA CMR + USGS integration, Okada forward modelling, 42-test validation suite, complete documentation, and a browser-verified single-page interface.

---
Task ID: 8
Agent: lead-architect
Task: Ingest the user's authenticated real NISAR 2026 granule (Earthdata bearer token + ASF URLs), integrate it as the flagship quantitative dataset, and harden the pipeline/UI for what it revealed

Work Log:
- Stored the user's Earthdata bearer token in .env (git-ignored; .env.example updated). Wrote tools/fetch_nisar_granule.py implementing the verified ASF auth flow: Bearer token -> 303 -> ~3h presigned CloudFront/S3 URL -> fetch WITHOUT the auth header (S3 rejects dual auth). Observed: the token presigns exactly ONCE (later attempts 401 invalid_token); the presigned URL + asf-urs session cookie remain the working credentials. Documented in code + docs.
- Downloaded NISAR_L2_PR_GUNW_021_013_D_071_022_4000_SH_20260522T024038...20260603..._001.h5 (2,575,302,656 bytes) via tools/parallel_fetch.sh (12 HTTP-range parts, ~19 MB/s, 2m16s) after discovering the sandbox reaper kills background downloads and single streams throttle to ~2 MB/s.
- Inspected the product: operational NISAR_L2_GUNW_PROVISIONAL_V1, southern Sierra/Owens Valley/Death Valley/Mojave scene (track 13, frame 71, DESCENDING LEFT-looking), 12-day pair, 4401x4338 @ 80 m EPSG:32611, lambda=0.2420 m (1.239 GHz), incidence 41.05 deg, heading 198.5 deg (from product LOS vectors), 208 looks, SNAPHU, SDS 0.25.16, spec 1.5.0, DOI 10.5067/NIL2GUNW-P1, real NISAR L1 RSLC inputs (DHDH).
- SCIENCE FINDINGS (measured): the pair was acquired through a severely disturbed ionosphere - product ionosphere phase screens std ~36 rad, correction-uncertainty median 3.73 rad (~72 mm); coherence collapsed uniformly (median 0.08; 12.3% >= 0.1, 0.3% >= 0.2); cc=0 areas carry a finite ~5-rad noise phase field (invalid filler); the single valid unwrapping component (324,103 px, 99.7% exact-zero phase) is a stable surface with max |LOS| 48 mm. A real M4.06 earthquake (Johannesburg, CA, 2026-06-01 22:34 UTC, 7.6 km depth) occurred inside the frame between acquisitions.
- Extracted lossless derived layers to data/derived/nisar-mojave-2026/ via tools/extract_gunw.py (unchanged tool, 2.2 s).
- Registered as dataset 'real-nisar-mojave-2026' (FIRST in the registry) with operational-collection provenance and suggestedParams { coherenceThreshold: 0.1 } (global 0.5 default would reject the scene at Stage B). Implemented suggestedParams end-to-end: science types, datasets registry, analyses route parameter precedence (body > dataset > global), frontend slider initialization/reset + hint.
- CRITICAL BUGS FOUND BY THE REAL DATA AND FIXED:
  1. FALSE-POSITIVE DETECTION: without gating on unwrapping connected components, the cc=0 noise filler produced 5,923 km2 "ground motion" with referenceSigmaM=0 (51% of reference pixels shared exact 0.0). Fixed: Stage B mask now requires component >= 1 (0 and 65535 excluded) + explicit warning when >50% of coherence-passing pixels are excluded (86% here). Cross-tab proved cc=1 is the valid measurement (99.7% exact-zero phase) and cc=0 is filler.
  2. Degenerate MAD fallback: when >50% of reference pixels share one exact value (MAD=0), fall back to std with a warning.
  3. Narrative credibility rule: affected areas below max(1 km2, 4 pixels) are described as isolated stray pixels consistent with statistical noise (shared with the attribution layer's detected flag) - LA now correctly reads "Isolated pixels ~0.01 km2".
  4. USGS FDSN HTTP 400: the client sent an invalid 'boundingbox' joined parameter; replaced with the correct minlatitude/maxlatitude/minlongitude/maxlongitude (verified live: returns the M4.06). The live cross-match now works for every dataset.
  5. Forward-model scaling hazard: Math.max(...spread) over 19M-element arrays + full-grid Okada evaluation; replaced with a deterministic <=400k strided subgrid + loop-based peaks.
  6. Iono double-count removed (per-pixel quadrature term contradicted the documented floor-only design; comments and code now agree).
  7. RASTER ASPECT BUG (browser): canvas aspect mixed Mercator radians with longitude degrees (57x unit error -> every overlay squashed to 760x64). Fixed to radians/radians (Mojave overlay now 1024x1001) + maxCanvasPx 760->1024.
  8. Added a 'Coverage' map layer (flat tone where mask=1) - the honest visualization for scenes whose displacement is ~zero (near-white on the diverging scale) or whose valid mask is sparse.
- INFRASTRUCTURE FINDINGS: the sandbox reaper kills Bash-spawned background processes between tool calls - the dev server must be launched as an orphaned double-fork (( setsid cmd & )) which survives (ppid=1). The original dev server was OOM-killed during my parallel download; restarting repeatedly OOM'd until root-causing Tailwind 4's content scanner reading the 2.58 GB .h5 (data/ was not git-ignored) -> added /data/ and /tools/venv/ to .gitignore + @source not directives in globals.css; postcss then completes in seconds. Bounded the analysis result cache (10 entries, oldest-first eviction).
- VERIFICATION (all green): bun test 42/42 pass (234 assertions); bun run lint 0/0; Mojave analysis via API: 324,103 valid px, 0 km2 detected, iono floor 71.8 mm, honest-negative narrative, M4.06 matched live, attribution null=supported/coseismic=insufficient-evidence; LA (stray-pixel narrative + unchanged iono story), synthetic-strikeslip (1372 km2, 135.7 mm, MAE 2.59 mm - identical to before), Panama evidence mode (60 live events, SPANS EVENT badges, browse gallery) all re-verified. Browser E2E (agent-browser + VLM): page loads with 0 console errors, 6 dataset cards (Mojave first), full analysis flow, displacement/coherence/sigma/coverage layer switching with correct legends and 1024x1001 overlays, earthquake marker, methodology drawer, mobile 390px clean (fresh render; docScrollW=clientW=390), footer pinned exactly at viewport bottom on scroll, desktop 1440px clean.
- Docs updated: data-sources.md (new section 2 with the full granule table + measured findings + verified auth flow in section 9; sections renumbered), methodology.md (Stage B cc-gate + MAD fallback + suggested params; Stage E subgrid; narrative credibility rule), validation.md (Mojave measured results + the two caught-by-real-data defect stories), architecture.md (Mojave timings, memory discipline, coverage layer), README (Mojave as the lead demonstration), .env.example, tools/fetch_nisar_granule.py docstring.

Stage Summary:
- The application now analyses a REAL OPERATIONAL NISAR mission product end-to-end (the previous real quantitative dataset was a 2008 ALOS sample). The flagship honest result: a severely ionosphere-degraded 12-day pair over the Mojave yields NO deformation claim - 2% valid coverage, 48 mm max motion vs a 72 mm systematic floor - while a real in-frame M4.06 earthquake is correctly reported as insufficient evidence rather than a cause.
- The real data immediately exposed and led to fixes of one false-positive detection mechanism (phase filler over cc=0 areas), one silent statistical degeneracy (MAD=0), one narrative overclaim path (stray pixels), one live-query regression (USGS bbox), one scaling hazard (19M-element spreads), and one browser rendering defect (57x aspect squash) - each now documented and regression-checked.
