# Science foundations

This document records the physical and statistical basis of every scientific
computation in MOTUS, the conventions (and how they were verified), and the
conditions under which each method fails.

## 1. The measurement problem

A synthetic-aperture radar (SAR) satellite transmits microwave pulses and
records the echoes. The phase of each echo depends on the distance the wave
travelled — the two-way *slant range* between the antenna and the ground.
When the same ground is observed twice from nearly the same orbital position
(a *repeat-pass interferometric pair*), a surface displacement along the
line of sight (LOS) changes that distance and shifts the echo phase.

The satellite measures the projection of the 3-D displacement vector onto
its LOS direction: a mix of vertical and horizontal motion, not height
change alone. Separating vertical from horizontal motion requires at least
two different viewing geometries (e.g. an ascending and a descending pair);
MOTUS analyses one pair at a time and does not claim to resolve the full
vector.

Key properties of the measurement:

- **One fringe = λ/2 of range change.** For the NISAR L-SAR wavelength
  (λ = 0.236 m from the product's centre frequency 1.26999975 GHz), one
  2π phase cycle = 118 mm of LOS motion.
- **The phase is ambiguous modulo 2π.** Unwrapping (performed upstream by
  the product generator with SNAPHU) recovers the integer-cycle count but
  can fail in low-coherence regions; whole-cycle errors appear as
  λ/2 · k steps (118 mm · k for L band).
- **The measurement is relative.** An interferogram's phase has an unknown
  2πk offset; a reference region must be chosen (see §4).

## 2. The NISAR phase convention (verified, not assumed)

The sign of the phase→displacement conversion is fully determined by which
scene is conjugated when forming the interferogram — the most common silent
error in InSAR software. MOTUS follows the convention of the NISAR SDS
itself, as specified in the official Algorithm Theoretical Basis Document:

> **Source:** NISAR NASA SDS Algorithm Theoretical Basis Document, JPL
> D-95677 Rev A (12 Nov 2023), §5.7 "Coregistered RSLCs cross-multiplication"
> and §5.11.1. Verified against the document text on 2026-10-20.

- The interferogram is formed by cross-multiplying the **reference** RSLC
  with the **secondary** RSLC, i.e. `I = S_ref · conj(S_sec)`.
- Flattening multiplies `exp(−j(4π/λ)δr)` where δr is the geometrical range
  offset between the two images.
- With the SLC phase convention `S = exp(−j4πR/λ)`, the interferometric
  phase is

```
φ = (4π/λ) · (R_secondary − R_reference)
```

whose components the ATBD decomposes as:

```
Δφ = (4π/λ) · (Δr_d + Δr_g + Δr_t + Δr_i + Δr_n)
      displacement  geometric  troposphere  ionosphere  noise
```

The NISAR L2 GUNW product applies the geometric, tropospheric and
ionospheric corrections upstream (documented in the product metadata; MOTUS
reads and displays these flags). The displacement is therefore recovered as

```
d_LOS = λ · φ / (4π)
```

with **positive d_LOS = an increase in range = ground motion AWAY from the
satellite**; negative = toward the satellite.

Note: the frequently quoted alternative `d = −λ·φ/(4π)` (e.g. in much
Sentinel-1 tooling) corresponds to the opposite conjugation order
(`S_sec · conj(S_ref)`). Both are correct within their own convention; the
error is to mix them. MOTUS documents and tests its convention
(`tests/science/core.test.ts`).

## 3. Line-of-sight geometry

For a right-looking satellite with heading H (degrees clockwise from north)
and incidence angle θ (from vertical at the target), the ground-to-satellite
unit vector in local East-North-Up components is:

```
û_gs = ( sin θ · sin(H+90°),  sin θ · cos(H+90°),  cos θ )
```

A displacement vector **u** projects onto range change as
`d = −u · û_gs` (motion toward the satellite shortens the range).

Verification: the NISAR sample product's radarGrid stores
`losUnitVectorX/Y` as the **satellite-to-ground** direction. For the
analysed granule (mean incidence 24.17°, ascending, heading −11.80° derived
from the same vectors) the stored means are (−0.4005, −0.0837); the
reconstruction above reproduces them to within 0.02 after sign flip
(asserted in `tests/science/core.test.ts`).

## 4. Referencing (Stage B)

An unwrapped interferogram carries an unknown constant. MOTUS estimates it
as the **median** of the displacement over a reference region and subtracts
it:

- **far-field (default):** the outer 12% margin band of the frame, where
  deformation is assumed absent;
- **full-frame median:** the median over all valid pixels.

The residual scatter of the reference region (robust MAD-based σ) becomes
part of the error budget. *Failure mode:* if deformation covers the entire
frame, the reference absorbs part of the signal — a caveat MOTUS states in
the reliability narrative. An optional planar detrend (default **off**)
exists for advanced use, with the explicit warning that a plane can absorb
real long-wavelength deformation.

## 5. Uncertainty model (Stage D)

### 5.1 Coherence-based phase noise

For an interferogram averaged over L independent looks with coherence
magnitude γ, the phase standard deviation is estimated with the classical
expression (Rodríguez & Martin 1992, IEE Proc.-F 139(2), Eq. 15; see also
Hanssen 2001, §4.2.2):

```
σ_φ = sqrt( (1 − γ²) / (2 · L · γ²) )      σ_d = λ σ_φ / (4π)
```

Worked examples for the analysed product (L = 119 looks, λ = 0.236 m):

| γ | σ_φ (rad) | σ_d |
|---|-----------|-----|
| 0.5 | 0.112 | 2.1 mm |
| 0.7 | 0.070 | 1.3 mm |
| 0.8 | 0.057 | 1.1 mm |
| 0.9 | 0.042 | 0.8 mm |

*Failure mode:* the expression is accurate for γ ≳ 0.3–0.4 and
underestimates the spread at low coherence, where the phase distribution
deviates strongly from Gaussian. Pixels below the coherence threshold
(default 0.5) are masked rather than measured, so the formula is only used
in its valid range.

### 5.2 The ionospheric systematic floor

The analysed product's `ionospherePhaseScreenUncertainty` has a robust
median of ≈ 4.31 rad ≈ 81 mm of equivalent range change. This is the
uncertainty of the **already-applied** ionospheric correction: a spatially
correlated systematic, not independent per-pixel noise. Folding it into the
per-pixel σ would be statistically wrong (it would shrink with averaging
like random noise); instead MOTUS raises the **detection floor** to the
systematic level and reports it (`summary.systematicIonoFloorM`, and a
plain-language sentence in the reliability narrative). Consequence: the 2008
sample product honestly reports *no detection* — its residual signal is
below its own systematic floor.

### 5.3 Combined detection rule

A pixel counts as *changed* only when

```
|d| > max( k · σ_total , physical floor )
```

with defaults k = 3 and floor = 10 mm (or the ionospheric systematic when
larger). The physical floor guards against declaring sub-noise variations
significant when coherence is very high but systematic residuals dominate —
the realistic situation for single L-band pairs.

## 6. Elastic dislocation modelling (Okada 1985)

### 6.1 Implementation and validation

`src/lib/science/okada.ts` is a surface-displacement port of the DC3D
algorithm (Okada 1985; Okada 1992), following the reference Python port
[dc3d.py](https://github.com/satoshi-pes/dc3d.py) (vendored at
`tools/dc3d_reference.py`).

- **Benchmark:** 24 geometries × 3 slip modes (strike/dip/tensile; dips
  10–90°, varied depths and footprints) agree with the reference to a worst
  relative difference of 0.0 (8 significant digits; 72 scalar comparisons).
  The benchmark values are frozen in `tests/science/okada.test.ts`.
- **Analytic calibration:** the friendly wrapper's buried vertical
  strike-slip matches the 2-D anti-plane solution
  `u(y) = (1/π)[atan(y/d₁) − atan(y/d₂)]` within ~1–10% (finite-length
  effects account for the residual at distance).
- **Fault placement:** DC3D's `aw` convention (positive = up-dip from the
  reference point; a buried fault spans `aw = [−W, 0]`) was determined
  empirically after an initial placement bug produced unphysical fields —
  caught precisely because the analytic calibration disagreed. The
  calibration is now a permanent test.

### 6.2 Slip-sense conventions (determined empirically)

Trace-jump tests on a near-surface-breaking steep fault fix the senses:

- **U1 (strike-slip) positive = sinistral** (left-lateral);
- **U2 (dip-slip) positive = normal** sense (hanging wall drops);
- **U3 (tensile) positive = opening.**

With the Aki & Richards rake convention (rake measured from strike in the
fault plane; 0 = sinistral, ±180 = dextral, +90 = reverse, −90 = normal),
the mapping used everywhere in MOTUS is:

```
U1 = slip · cos(rake)        U2 = −slip · sin(rake)
```

### 6.3 Scaling relations

- Moment–magnitude (Hanks & Kanamori 1979): `M0 = 10^(1.5 Mw + 9.1)` N·m.
- Rupture area (Wells & Coppersmith 1994, all slip types):
  `log10(A/km²) = 0.91 Mw − 3.49`, with regression scatter ≈ 0.25 decades
  (factor ~1.8). A 2:1 length:width aspect ratio is assumed.
- Uniform slip: `slip = M0 / (μ A)`, μ = 3×10¹⁰ Pa.

*Failure mode:* the scaling relations make the forward model an
order-of-magnitude screen. The Panama evidence page says so explicitly, and
the attribution thresholds (below) are correspondingly coarse.

## 7. Attribution (Stage E)

Candidate hypotheses — coseismic deformation, slow surface motion
(subsidence/uplift/landslide), atmospheric/ionospheric residual,
unwrapping artefact, and no-change — are evaluated by transparent,
evidence-linked rules (never a trained classifier):

- **Independent evidence:** USGS ComCat events (FDSN API) whose origin times
  fall strictly inside the acquisition window and near the footprint; their
  moment-tensor nodal planes feed the forward model.
- **Forward-model consistency screen:** predicted vs measured peak amplitude
  ratio within a factor of 3 AND spatial correlation r > 0.25 →
  "consistent"; only one check passing → "plausible"; both failing →
  "not-supported". These thresholds are documented conventions for a coarse
  screen, not calibrated probabilities.
- **Insufficient evidence is a first-class output.** Every hypothesis
  carries its evidence items and a "what would settle it" note.

*Failure modes:* amplitude ratio and correlation can be misleading when the
event lies outside the coherent footprint or when the empirical rupture
dimensions are far off; the UI always displays the check's components so a
reader can judge.

## 8. Geodesy

UTM forward/inverse conversions implement the Snyder (1987) transverse
Mercator series (USGS Professional Paper 1395, ch. 8), accurate at the
metre level within a zone — far below the 80 m posting of the products, and
used only for map alignment and footprint construction. The browser-side
raster overlay renders in Web Mercator geometry by inverting Mercator per
canvas pixel and sampling the UTM grid, so the overlay is geographically
exact by construction (grid-zone edges are masked rather than distorted).

## 9. What this system does not claim

- No vertical/horizontal decomposition (single geometry).
- No time-series analysis (single pair per run).
- No causal probabilities (rule-based screening only).
- No fabrication: when the Panama HDF5 cannot be downloaded (Earthdata
  credentials), MOTUS presents metadata, official imagery and a labelled
  forward model — and says that is what it is doing.
