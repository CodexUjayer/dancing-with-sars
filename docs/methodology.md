# Methodology — end-to-end processing

This document mirrors the actual implementation
(`src/lib/science/pipeline.ts` and the modules it orchestrates). The
pipeline is deterministic: the same dataset and parameters always produce
the same result, which makes every run reproducible and cacheable.

## Stage A — input validation (`validation.ts`)

A dataset is rejected (with explicit, user-visible reasons) when:

- phase or coherence rasters are missing, or their dimensions are invalid;
- the phase and coherence grids are not co-registered (different shapes or
  origins);
- `numberOfLooks < 1` or the wavelength is outside 0.001–1 m;
- acquisition times are missing, not ISO-8601, or temporally inverted;
- fewer than 1% of sampled values are valid (the grid appears empty).

Warnings (non-fatal): non-UTM EPSG codes, incidence angles outside the
typical 20–40° range, degenerate footprint polygons, evidence datasets
without access notes.

## Stage B — preprocessing and referencing

1. **Quality mask:** a pixel is measurable only where phase and coherence
   are finite and coherence ≥ threshold (default 0.5). Fewer than 100
   surviving pixels aborts the run with a clear error.
2. **Reference region:**
   - far-field strategy (default): the outer 12% margin band of the frame;
   - full-frame median: all valid pixels.
   If the reference region has fewer than 50 pixels, the strategy falls
   back to the full frame with a warning (large anomaly may violate the
   far-field assumption).
3. **Offset removal:** the median displacement over the reference region is
   subtracted from all valid pixels. (Median, not mean: 50% breakdown point
   against unwrapping outliers.)
4. **Optional planar detrend (default off):** a least-squares plane fitted
   over the reference region may be removed, with the standing caveat that
   a plane can absorb real long-wavelength deformation. The caveat is
   surfaced in the UI and in a pipeline warning when applied.

Upstream processing (orbit, coregistration, topographic/ellipsoidal
flattening, ionospheric and tropospheric corrections, SNAPHU unwrapping,
geocoding) is performed by the NISAR SDS before distribution; MOTUS reads
the product's own flags documenting each correction and displays them,
rather than reprocessing (see docs/data-sources.md §2).

## Stage C — change measurement

- Phase → displacement: `d = λφ/(4π)` under the verified NISAR convention
  (docs/science.md §2); positive = away from the satellite.
- Summary statistics over valid pixels: affected area, toward/away areas,
  extremes, displacement-weighted anomaly centroid, principal-axis
  orientation and elongation (second moments of |d|), and the signed
  displacement integral over the anomaly (m·km²).
- Connected components: components of the unwrapping label map holding ≥1%
  of valid pixels are counted; value 65535 (invalid) is excluded. Multiple
  components are flagged in the reliability narrative as potential
  cycle-jump boundaries.

## Stage D — uncertainty

Per-pixel one-sigma:

```
σ_total = sqrt( σ_pixel² + σ_ref² + σ_iono² )
```

- `σ_pixel` from the coherence formula (Rodríguez & Martín 1992) with the
  product's look count (119 for the analysed sample);
- `σ_ref` = MAD-based robust sigma of the reference region;
- `σ_iono` included only when the dataset declares an ionospheric screen
  uncertainty **and** it is treated as per-pixel (synthetic fixtures);
  for the real product the ionospheric term is instead handled as the
  systematic detection floor below.

**Detection rule:** `|d| > max(k·σ_total, floor)` with k = 3 by default and
floor = max(10 mm, ionospheric systematic) — the systematic floor from the
product's ionosphere screen uncertainty (81 mm for the analysed sample) is
spatially correlated and therefore raises the floor rather than the
per-pixel noise (docs/science.md §5.2).

## Stage E — attribution

1. The API layer queries USGS ComCat (±1 day around the acquisition window,
   footprint bbox + 0.5°, M ≥ 4) and filters events to those strictly
   inside the window and within 400 km.
2. If an event with a published nodal plane exists, an Okada85 forward
   model is evaluated on the dataset grid (uniform slip; fault dimensions
   from Wells & Coppersmith 1994 area scaling with 2:1 aspect; moment from
   Hanks & Kanamori 1979; slip = M0/(μA)) and compared with the
   measurement: amplitude ratio and Pearson pattern correlation.
3. Hypotheses (coseismic, slow surface motion, atmospheric residual,
   unwrapping artefact, no-change) receive evidence-linked statuses; the
   thresholds (amplitude ratio within factor 3; r > 0.25) are documented as
   coarse-screen conventions.
4. The method note is always displayed, including the statement that the
   layer is not a calibrated classifier.

## Synthetic validation comparison

For fixtures with analytic ground truth, the pipeline compares its output
with the truth on a deterministic sparse sample (~50k points) and reports
MAE / RMSE / bias / n. This validates the processing mathematics only —
the note displayed with every validation block says so.

## Transport to the browser

Results are downsampled (area-average, ≤640 px per side, mask-preserving)
into a `TransportGrid` (Float32 displacement/coherence/σ + Uint8 mask,
base64 little-endian) plus the grid georeferencing. The browser re-renders
the grid into a Web-Mercator-exact canvas (per-pixel Mercator inversion →
UTM → nearest-neighbour sample) and overlays it as a geographically exact
image rectangle. Recolouring on layer/scale changes does not re-warp.

## Narrative generation

Plain-language blocks are assembled from the measured numbers (templates in
`pipeline.ts`): *What changed? How much? How reliable is this result?*
Every quantity quoted in a sentence comes from the computed summary — no
canned claims.

## Tooling

- `tools/extract_gunw.py` — documented, lossless HDF5 → derived-layers
  extractor with full metadata capture (see docs/data-sources.md §2).
- `src/lib/science/fixtures.ts` — deterministic fixture generator chain:
  Okada truth → LOS projection → phase conversion → coherence-consistent
  noise → atmospheric ramp → decorrelation patches.

## Defaults

| Parameter | Default | Meaning |
|---|---|---|
| `coherenceThreshold` | 0.5 | minimum coherence to measure |
| `referenceStrategy` | farField | 12% frame margin |
| `farFieldMargin` | 0.12 | margin fraction |
| `detrend` | false | planar detrend off |
| `detectionFloor` | 0.01 m | physical floor (raised by iono systematic when present) |
| `significanceK` | 3 | k·σ multiplier |

All parameters are exposed in the UI's advanced controls with sensible
bounds (Zod-validated server-side).
