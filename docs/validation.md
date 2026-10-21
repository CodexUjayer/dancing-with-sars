# Validation

Recorded 2026-10-20, from the actual test run in this repository
(`bun test tests/`): **42 tests, 42 pass, 0 fail, 234 assertions, ~1.2 s.**

> A passing software test is not equivalent to scientific validation. This
> page separates what is verified, how, and what deliberately remains
> unvalidated.

## 1. Test inventory

### tests/science/okada.test.ts — the physics engine

| Test | What it proves |
|---|---|
| matches the DC3D reference implementation to ≤1e-8 relative | 24 benchmark geometries × 3 slip modes (dips 10°–90°, varied depths/footprints) against the vendored reference port of Okada's official code; worst relative difference observed: **0.0** (8 significant digits, 72 scalar comparisons) |
| friendly wrapper places the fault BELOW the top-edge depth | buried vertical strike-slip matches the 2-D analytic screw solution `u(y)=(1/π)[atan(y/d₁)−atan(y/d₂)]` within 1–10% (finite-length effects explain the residual); uy=uz=0 exactly by symmetry |
| dip-slip U2=+1 is normal-sense | hanging wall drops across the trace (uz jump < −0.5) |
| strike-slip U1=+1 is sinistral | trace-jump sign test |
| tensile U3=+1 is opening | walls separate across the trace |
| displacement decays to ~0 far from the fault | far-field sanity (|u| < 0.01 at 10 fault-lengths) |
| moment and area scaling behave sensibly | Mw 7 → M0 ≈ 3.55×10¹⁹ N·m (Hanks & Kanamori); area ≈ 750 km² (Wells & Coppersmith); slip ~1.5 m |

The benchmark values are frozen in the test file; regenerating requires the
vendored `tools/dc3d_reference.py`, so the reference is reproducible.

### tests/science/core.test.ts — conventions and statistics

| Test | What it proves |
|---|---|
| one fringe = λ/2; +2π → +λ/2 range increase | the phase→displacement scale and sign under the NISAR convention |
| round-trip phase↔displacement | internal consistency |
| wrapPhase maps into (−π, π] | wrapping convention |
| k-cycle unwrapping error = k·λ/2 | ambiguity magnitude (118 mm/cycle at L band) |
| grid conversion propagates NaN | no-data handling |
| LOS vector is a unit vector; projection signs | pure vertical motion projects to −cos θ; motion toward the satellite is negative range change |
| reconstruction matches the NISAR sample product vector | rebuilt (θ, H) → E/N agrees with the product's stored radarGrid means (−0.4005, −0.0837) within 0.02 |
| σ_φ monotonic in γ and L; known value at γ=0.5, L=119 (0.112 rad) | the uncertainty formula is exactly Rodríguez & Martín (1992) |
| combined σ adds in quadrature; detection threshold = max(k·σ, floor) | error propagation and the detection rule |
| median/MAD/mean/std/quantile/planar fit/Pearson | the statistics layer (exact plane recovery; correlation edge cases) |

### tests/science/pipeline.test.ts — geodesy, gates, end-to-end

| Test | What it proves |
|---|---|
| UTM zone determination; round trip < 1 m | Snyder series correctness at 5 sites including both hemispheres |
| NISAR sample grid corner inverse-projection | the extracted 2008 grid's corner falls inside the product's recorded footprint bbox |
| Stage A rejects mismatched grids / inverted times / implausible wavelength | the validation gates fire |
| **null fixture produces no detection** | false-alarm control: zero affected area, "no change" hypothesis *supported*, RMSE vs truth 1.83 mm |
| **strike-slip fixture recovered** | 1372 km² detected above threshold; pipeline-vs-truth MAE 2.59 mm, RMSE 3.18 mm, bias −2.04 mm over ~65k points |
| real NISAR LA sample runs honestly | ionospheric systematic floor 81 mm reported; valid fraction 14.7%; coherence median 0.57; the reliability narrative names the ionospheric limitation |
| coherence-threshold rejection | a 0.97 threshold aborts with a clear error rather than producing noise |
| fixtures are deterministic | seeded PRNG + identical rasters on repeated construction |

## 2. End-to-end validation results (measured, not asserted by hand)

Synthetic strike-slip fixture (dextral, Mw≈6.5-equivalent, 250 m posting,
patchy decorrelation, ±4 mm atmospheric ramp):

| Metric | Value |
|---|---|
| MAE vs analytic truth | 2.59 mm |
| RMSE | 3.18 mm |
| Bias | −2.04 mm |
| Peak LOS recovered | +135.7 / −84.2 mm |
| Affected area above threshold | 1372 km² |
| Valid fraction | 99.2% |

Synthetic thrust fixture: MAE 3.93 mm, RMSE 4.86 mm, peak +391 mm, 494 km².
Synthetic null fixture: **0 km² detected** (correct), RMSE 1.83 mm.

Real NISAR LA sample (ALOS PALSAR via NISAR SDS): 14.7% valid pixels
(terrain/masking), median coherence 0.57, reference scatter 18.6 mm,
ionospheric systematic floor 81 mm → **no detection above floor**. This is
the scientifically correct outcome for a pair whose residual signal sits
below its own systematic budget, and the application says exactly that.

Real NISAR operational granule — Mojave, May–June 2026 (12-day pair
through a disturbed ionosphere): 324,103 valid pixels (2% of a 4401 × 4338
frame — the rest is either decorrelated or carries invalid non-unwrapped
phase), analysed area 2,074 km², median coherence 0.14, reference scatter
0.5 mm (MAD-degenerate → σ fallback, warned), ionospheric systematic floor
71.8 mm, **max |LOS displacement| 48 mm → 0 km² detected**. The live USGS
cross-match finds the real M4.06 earthquake inside the frame and window
(2026-06-01, Johannesburg, CA) and the coseismic hypothesis is reported as
*insufficient evidence* — its expected deformation is far below the floor.
Attribution: no-change **supported**, atmospheric residual *plausible*.

**Two real-data defects were caught by this dataset and fixed with
regression checks:**

1. *Product phase-filler false positive.* Without gating on the
   unwrapping connected components, the granule's cc = 0 noise field
   (finite but invalid phase, std ≈ 5 rad) produced a 5,923 km² "detection"
   with a reference MAD of exactly zero. Cross-tabulating the component
   labels against the phase field showed cc = 1 (the actual measurement)
   is 99.7% exact-zero phase — the stable truth. Stage B now enforces
   component ≥ 1 and warns when large fractions are excluded (86% here).
2. *Raster aspect bug.* The browser overlay computed its canvas aspect
   from a Mercator span in radians divided by a longitude span in degrees
   — a 57× unit mismatch that squashed every canvas to a 760 × 64 strip.
   Dense scenes hid it; the Mojave's 2%-valid sparse mask exposed it.
   Fixed (radians/radians) and re-verified: overlays now render at
   ~1024 × 1001 for this frame.

## 3. What is deliberately NOT validated

- **No comparison against independent geodetic measurements** (GNSS, or
  published InSAR studies of the 2008 LA region) has been ingested. Such a
  comparison is the natural next validation step and is documented as a gap.
- **The Panama prediction is a forward model, not a validated
  measurement.** The M7.7 products require Earthdata credentials to
  download; nothing in this deployment claims to have measured that event.
- **Attribution thresholds are conventions, not calibrated statistics.**
  No precision/recall claims are made anywhere for the hypothesis screen,
  and no probability calibration exists.
- **The coherence-based σ underestimates below γ ≈ 0.3** (documented;
  masked pixels keep the formula inside its valid range).
- **Single-run geodesy tolerances:** UTM series accuracy (~metre level) is
  adequate for 80 m products but is not geodetic-grade.
- **No automated UI tests.** The interface was verified interactively
  (dataset selection, both analysis modes, layer switching, methodology
  drawer, live CMR query, responsive layout, footer behaviour) during
  development; those checks are not repeatable artifacts.

## 4. Reproducibility

- Fixtures are seeded (`mulberry32`); the pipeline is a pure function of
  (dataset, parameters, USGS events).
- Analysis runs are persisted (`AnalysisRun` table) with parameters,
  summaries and durations; identical parameter sets are served from an
  in-memory cache within a server session.
- The Okada benchmarks are frozen in the test file and regenerable from the
  vendored reference implementation.
