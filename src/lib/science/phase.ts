/**
 * Interferometric phase <-> line-of-sight displacement conversions.
 *
 * CONVENTION (documented from the official NISAR SDS documents):
 *
 * The NISAR L1/L2 ATBD (JPL D-95677, Rev A, 12 Nov 2023, Section 5.7
 * "Coregistered RSLCs cross-multiplication") specifies that the wrapped
 * interferogram is formed by cross-multiplying the *reference* RSLC with the
 * *secondary* RSLC and is flattened by multiplying exp(-j (4pi/lambda) dr),
 * where dr is the geometrical range offset between the reference and secondary
 * images. Writing S = exp(-j 4 pi R / lambda) for the focused SLC phase, the
 * resulting interferogram phase is
 *
 *      phi = (4 pi / lambda) * (R_secondary - R_reference)
 *
 * whose components the ATBD decomposes as (Section 5.11.1):
 *
 *      dphi = (4 pi / lambda) * (dr_d + dr_g + dr_t + dr_i + dr_n)
 *
 * where dr_d is the surface displacement in the line-of-sight direction and
 * the remaining terms are geometric, tropospheric, ionospheric and noise range
 * differences. Because the GUNW product is already flattened (geometric term
 * removed) and corrected for troposphere and ionosphere (per product metadata),
 * the displacement contribution is recovered as
 *
 *      d_LOS = lambda * phi / (4 pi)
 *
 * with POSITIVE d_LOS meaning an INCREASE in radar range, i.e. ground motion
 * AWAY from the satellite; negative d_LOS = motion TOWARD the satellite.
 *
 * Note that the frequently quoted alternative d = -lambda*dphi/(4*pi) refers to
 * the opposite conjugation order; the sign is fully determined by which scene
 * is conjugated when forming the interferogram, and we follow the NISAR SDS
 * convention above.
 */

/** One interferometric fringe = half a wavelength of range change (metres). */
export function fringeDisplacement(wavelength: number): number {
  return wavelength / 2;
}

/**
 * Convert unwrapped interferometric phase to line-of-sight displacement
 * following the NISAR SDS convention (see module docstring).
 *
 * @param phaseRad  unwrapped phase in radians
 * @param wavelength radar wavelength in metres
 * @returns LOS displacement in metres (+ = away from radar)
 */
export function phaseToDisplacement(phaseRad: number, wavelength: number): number {
  return (wavelength * phaseRad) / (4 * Math.PI);
}

/** Inverse of phaseToDisplacement: displacement -> phase (radians). */
export function displacementToPhase(displacementM: number, wavelength: number): number {
  return (4 * Math.PI * displacementM) / wavelength;
}

/**
 * Phase equivalent of one 2-pi ambiguity in displacement units (same as
 * fringeDisplacement; provided under a pedagogical name for the UI).
 */
export function ambiguityPerFringe(wavelength: number): number {
  return wavelength / 2;
}

/**
 * Wrap an arbitrary (unwrapped) phase into (-pi, pi].
 */
export function wrapPhase(phaseRad: number): number {
  const twoPi = 2 * Math.PI;
  let p = phaseRad % twoPi;
  if (p > Math.PI) p -= twoPi;
  if (p <= -Math.PI) p += twoPi;
  return p;
}

/**
 * Coefficient of the phase-unwrapping ambiguity in displacement:
 * an integer 2-pi error of k cycles corresponds to k * lambda/2 metres.
 */
export function unwrapErrorDisplacement(cycles: number, wavelength: number): number {
  return cycles * (wavelength / 2);
}

/**
 * Vectorised phase -> displacement for a Float32Array grid in place-safe form.
 * NaN propagates as NaN.
 */
export function phaseGridToDisplacement(
  phase: Float32Array,
  wavelength: number,
): Float32Array {
  const out = new Float32Array(phase.length);
  const k = wavelength / (4 * Math.PI);
  for (let i = 0; i < phase.length; i++) {
    const p = phase[i];
    out[i] = Number.isNaN(p) ? NaN : k * p;
  }
  return out;
}
