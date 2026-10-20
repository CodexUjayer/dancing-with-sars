/**
 * Stage E — cause investigation (attribution layer).
 *
 * Attribution is built ON TOP of validated change measurements and
 * independent evidence. It is a transparent rule-based screen, not a trained
 * classifier: every status is traceable to an explicit evidence item, and
 * the layer is required to say "insufficient evidence" rather than guess.
 *
 * Independent evidence used:
 *   - USGS ComCat events (FDSN API) inside the acquisition window and
 *     within/near the frame footprint.
 *   - Okada (1985) forward modelling from the published USGS moment-tensor
 *     nodal plane (strike/dip/rake) with empirical magnitude-area scaling
 *     (Wells & Coppersmith 1994) and the Hanks & Kanamori (1979) moment.
 *
 * The forward model is a CONSISTENCY SCREEN, not an inversion: we compare
 * the predicted and measured fields' amplitudes and spatial correlation and
 * report agreement classes, never a probability of causation.
 */

import type {
  AttributionOutput,
  ChangeSummary,
  Hypothesis,
  RadarGeometry,
  ScienceDataset,
  UsgsEventLite,
  Raster,
} from './types';
import { pearson } from './statistics';
import {
  geoFaultDisplacementENU,
  momentFromMw,
  ruptureAreaFromMw,
  slipFromMoment,
} from './okada';
import { projectDisplacementToLOS, losUnitVector } from './los-projection';

/** Great-circle distance in km (spherical Earth). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distance from a point to the polygon centroid (km) — coarse containment proxy. */
function distanceToFootprintKm(ds: ScienceDataset, lat: number, lon: number): number {
  const poly = ds.footprintPolygon;
  if (!poly || poly.length === 0) return NaN;
  let cx = 0;
  let cy = 0;
  for (const [x, y] of poly) {
    cx += x;
    cy += y;
  }
  cx /= poly.length;
  cy /= poly.length;
  return haversineKm(lat, lon, cy, cx);
}

/**
 * Evaluate hypotheses given the measured summary, dataset geometry and the
 * (already queried) USGS events inside the window.
 */
export function evaluateAttribution(
  ds: ScienceDataset,
  summary: ChangeSummary,
  events: UsgsEventLite[],
  forwardModel?: {
    eventId: string;
    amplitudeRatio: number;
    patternCorrelation: number;
    predictedPeakM: number;
    measuredPeakM: number;
    note: string;
  },
): AttributionOutput {
  const hyp: Hypothesis[] = [];
  const significant =
    summary.affectedAreaKm2 > 0 &&
    Math.max(Math.abs(summary.maxAwayM), Math.abs(summary.maxTowardM)) > 0;

  const detected = significant && summary.affectedAreaKm2 >= Math.max(1, summary.pixelAreaKm2 * 4);

  // ---- H1: coseismic deformation -------------------------------------
  const ev = events.length > 0 ? events[0] : undefined;
  const coseismicEvidence: string[] = [];
  let coseismicStatus: Hypothesis['status'] = 'insufficient-evidence';
  if (events.length > 0 && ev) {
    coseismicEvidence.push(
      `${events.length} USGS catalog event(s) occurred inside the acquisition window ` +
        `(${ds.provenance.referenceTime.slice(0, 10)} to ${ds.provenance.secondaryTime.slice(0, 10)}); ` +
        `largest: M${ev.magnitude.toFixed(1)} ${ev.place} at ${ev.time.slice(0, 16).replace('T', ' ')} UTC, ` +
        `${ev.depthKm.toFixed(0)} km deep.`,
    );
    if (detected && forwardModel) {
      coseismicEvidence.push(
        `Okada (1985) forward model from the USGS nodal plane predicts a peak LOS displacement of ` +
          `${(forwardModel.predictedPeakM * 1000).toFixed(0)} mm; the measurement peaks at ` +
          `${(forwardModel.measuredPeakM * 1000).toFixed(0)} mm (amplitude ratio ` +
          `${forwardModel.amplitudeRatio.toFixed(2)}).`,
      );
      coseismicEvidence.push(
        `Spatial correlation between the predicted and measured displacement fields: r = ` +
          `${Number.isNaN(forwardModel.patternCorrelation) ? 'n/a' : forwardModel.patternCorrelation.toFixed(2)}.`,
      );
      const ampOk = forwardModel.amplitudeRatio > 0.3 && forwardModel.amplitudeRatio < 3;
      const corrOk = forwardModel.patternCorrelation > 0.25;
      if (ampOk && corrOk) {
        coseismicStatus = 'consistent';
        coseismicEvidence.push(
          'Amplitude within a factor of 3 and positive spatial correlation: the measured field is ' +
            'consistent with elastic dislocation from the catalogued event.',
        );
      } else if (ampOk || corrOk) {
        coseismicStatus = 'plausible';
        coseismicEvidence.push(
          'Only part of the consistency checks pass; other contributions (afterslip, atmospheric ' +
            'residuals, unwrapping errors) may also be present.',
        );
      } else {
        coseismicStatus = 'not-supported';
        coseismicEvidence.push(
          'Amplitude and pattern do not match the forward model; coseismic origin of the measured ' +
            'signal is not supported (event may be outside the coherent footprint).',
        );
      }
    } else if (!detected) {
      coseismicStatus = 'insufficient-evidence';
      coseismicEvidence.push(
        'No displacement above the detection threshold was measured, so coseismic deformation ' +
          'cannot be confirmed from this pair (possible reasons: event outside coherent coverage, ' +
          'deformation below the noise floor, or decorrelation over the epicentral area).',
      );
    } else {
      coseismicStatus = 'insufficient-evidence';
      coseismicEvidence.push(
        'Measured change exists but no focal mechanism / geometry was available for a forward-model check.',
      );
    }
  } else {
    coseismicEvidence.push(
      'No USGS catalog earthquake of the queried magnitude occurred inside the acquisition window ' +
        'near this footprint.',
    );
    coseismicStatus = 'not-supported';
  }
  hyp.push({
    id: 'coseismic',
    label: 'Earthquake (coseismic deformation)',
    description:
      'Sudden slip on a fault moves the surface elastically during the time between the two radar acquisitions.',
    status: coseismicStatus,
    evidence: coseismicEvidence,
    discriminatingObservation:
      'An independent geodetic or seismic source model of the event, or an interferogram from a ' +
      'different viewing geometry, would confirm or reject this explanation.',
  });

  // ---- H2: anthropogenic / slow surface motion ------------------------
  const anthroEvidence: string[] = [];
  let anthroStatus: Hypothesis['status'] = 'insufficient-evidence';
  if (detected) {
    anthroEvidence.push(
      `Detected anomaly covers ${summary.affectedAreaKm2.toFixed(0)} km² with peak LOS motion ` +
        `of ${(summary.maxAwayM * 1000).toFixed(1)} mm away / ${(summary.maxTowardM * 1000).toFixed(1)} mm toward the radar.`,
    );
    if (events.length === 0 && coseismicStatus === 'not-supported') {
      anthroStatus = 'plausible';
      anthroEvidence.push(
        'No catalogued earthquake coincides with the signal, so non-seismic processes ' +
          '(groundwater withdrawal, compaction, landslides, volcanic or geothermal activity) remain plausible.',
      );
    } else {
      anthroStatus = 'insufficient-evidence';
      anthroEvidence.push(
        'A seismic candidate exists; slow anthropogenic processes cannot be excluded from a single pair alone.',
      );
    }
    anthroEvidence.push(
      'This system does not hold land-use or groundwater data, so it cannot decide between these ' +
        'sub-mechanisms; it reports them as unresolved.',
    );
  } else {
    anthroEvidence.push('No significant change detected above the noise floor.');
    anthroStatus = 'insufficient-evidence';
  }
  hyp.push({
    id: 'anthropogenic-slow',
    label: 'Slow surface motion (subsidence / uplift / landslide)',
    description:
      'Groundwater extraction, soil compaction, mining, landsliding or volcanic sources move the surface gradually.',
    status: anthroStatus,
    evidence: anthroEvidence,
    discriminatingObservation:
      'A displacement time series over many acquisitions (trend persistence) plus land-use context ' +
        'would discriminate subsidence-style processes from episodic events.',
  });

  // ---- H3: atmospheric / ionospheric residual --------------------------
  const atmEvidence: string[] = [];
  let atmStatus: Hypothesis['status'] = 'insufficient-evidence';
  const peakMm = Math.max(Math.abs(summary.maxAwayM), Math.abs(summary.maxTowardM)) * 1000;
  atmEvidence.push(
    'The product metadata records tropospheric and ionospheric corrections as applied by the ' +
      'producing SDS; residual delays nevertheless remain a classical InSAR error source ' +
      '(Hanssen 2001, chapters 6 and 9).',
  );
  if (detected) {
    if (peakMm < 30) {
      atmStatus = 'plausible';
      atmEvidence.push(
        `Peak displacement (${peakMm.toFixed(0)} mm) is below ~30 mm, the order of typical ` +
          'uncorrected tropospheric residuals; an atmospheric contribution to the whole pattern cannot be excluded.',
      );
    } else {
      atmStatus = 'not-supported';
      atmEvidence.push(
        `Peak displacement (${peakMm.toFixed(0)} mm) exceeds what residual atmosphere typically produces; ` +
          'a purely atmospheric origin is unlikely to explain the full amplitude.',
      );
    }
  } else {
    atmStatus = 'plausible';
    atmEvidence.push(
      'Residual atmospheric signal below the detection threshold is the expected explanation for ' +
        'sub-threshold spatially smooth variations.',
    );
  }
  hyp.push({
    id: 'atmospheric',
    label: 'Atmospheric / ionospheric residual',
    description:
      'Water-vapour and ionosphere changes between acquisitions imprint apparent phase even after standard corrections.',
    status: atmStatus,
    evidence: atmEvidence,
    discriminatingObservation:
      'Comparison with an independent weather model (e.g. ERA5 delays) or with a pair from a ' +
        'different time spanning the same area would separate atmospheric artefacts from real motion.',
  });

  // ---- H4: unwrapping error --------------------------------------------
  const unwrapEvidence: string[] = [];
  let unwrapStatus: Hypothesis['status'] = 'insufficient-evidence';
  if (summary.connectedComponentCount > 1) {
    unwrapStatus = 'plausible';
    unwrapEvidence.push(
      `${summary.connectedComponentCount} unwrapping connected components hold valid pixels; ` +
        'phase offsets between components can masquerade as step-like displacement.',
    );
  } else {
    unwrapStatus = 'not-supported';
    unwrapEvidence.push(
      'A single unwrapping connected component covers the valid pixels; gross 2-pi branch errors ' +
        'are unlikely (not fully excluded).',
    );
  }
  hyp.push({
    id: 'unwrapping',
    label: 'Phase-unwrapping artefact',
    description:
      'If the phase unwrapper jumps by whole cycles between regions, apparent displacement steps appear that are not physical.',
    status: unwrapStatus,
    evidence: unwrapEvidence,
    discriminatingObservation:
      'Re-unwrapping with a different algorithm or inspecting the wrapped phase along the component ' +
        'boundary would reveal cycle jumps.',
  });

  // ---- H5: no significant change ----------------------------------------
  hyp.push({
    id: 'null',
    label: 'No change above measurement noise',
    description: 'The surface did not move measurably between the two acquisitions within detection limits.',
    status: detected ? 'not-supported' : 'supported',
    evidence: [
      detected
        ? `A significant anomaly (${summary.affectedAreaKm2.toFixed(0)} km² above threshold) was detected.`
        : 'No pixel exceeded the combined statistical and physical detection threshold.',
      `Median per-pixel one-sigma uncertainty: ${(summary.medianSigmaM * 1000).toFixed(1)} mm.`,
    ],
    discriminatingObservation: undefined,
  });

  // Order: supported/consistent first, then plausible, then insufficient, then not-supported.
  const rank: Record<Hypothesis['status'], number> = {
    supported: 0,
    consistent: 1,
    plausible: 2,
    'insufficient-evidence': 3,
    'not-supported': 4,
  };
  hyp.sort((a, b) => rank[a.status] - rank[b.status]);

  return {
    hypotheses: hyp,
    events,
    forwardModelCheck: forwardModel,
    methodNote:
      'Rule-based, evidence-linked screening. Forward-model checks use the Okada (1985) elastic ' +
      'half-space with the USGS moment-tensor nodal plane, Wells & Coppersmith (1994) area scaling ' +
      'and Hanks & Kanamori (1979) moment-magnitude relation. Amplitude agreement within a factor ' +
      'of 3 and pattern correlation r > 0.25 are treated as consistent; these thresholds are ' +
      'documented conventions for a coarse screen, not calibrated probabilities.',
  };
}

/**
 * Forward-model consistency check: predict LOS displacement from a USGS
 * event's nodal plane over the dataset grid, compare with measurement.
 */
export function forwardModelCheck(
  ds: ScienceDataset,
  event: UsgsEventLite | undefined,
  displacement: Float32Array | undefined,
  mask: Uint8Array | undefined,
): AttributionOutput['forwardModelCheck'] | undefined {
  if (!event || !ds.phase || !displacement) return undefined;
  const np = event.nodalPlane;
  if (!np) return undefined;

  const meta = ds.phase.meta;
  const area = ruptureAreaFromMw(event.magnitude);
  const moment = momentFromMw(event.magnitude);
  // Aspect ratio 2:1 (documented assumption).
  const width = Math.sqrt(area / 2);
  const length = 2 * width;
  const slip = slipFromMoment(moment, area);
  const centroidDepth = Math.max(4000, event.depthKm * 1000);

  const fault = {
    strikeDeg: np.strike,
    dipDeg: np.dip,
    rakeDeg: np.rake,
    lengthM: length,
    widthM: width,
    topDepthM: 0, // computed inside from centroid depth
    slipM: slip,
    centroidLat: event.lat,
    centroidLon: event.lon,
  };

  const los = losUnitVector(
    ds.geometry.incidenceAngleDeg,
    ds.geometry.headingDeg,
    ds.geometry.lookDirection,
  );

  // Local ENU origin at the dataset centre (grid coords -> metres offset).
  const cx = meta.xStart + ((meta.width - 1) / 2) * meta.xSpacing;
  const cy = meta.yStart + ((meta.height - 1) / 2) * meta.ySpacing;

  // Evaluate on a deterministic strided subgrid: the Okada field is smooth at
  // grid scale, so a subgrid carries the same amplitude/pattern information
  // while keeping the consistency screen cheap on large NISAR frames
  // (full frames reach ~2e7 pixels). Peaks are computed with explicit loops
  // (never argument spreads, which overflow on large arrays).
  const n = meta.width * meta.height;
  const stride = Math.max(1, Math.floor(n / 400000));
  const meas: number[] = [];
  const prd: number[] = [];
  let predPeak = 0;
  let measuredPeak = 0;

  for (let idx = 0; idx < n; idx += stride) {
    const i = Math.floor(idx / meta.width);
    const j = idx % meta.width;
    const x = meta.xStart + j * meta.xSpacing - cx;
    const y = meta.yStart + i * meta.ySpacing - cy;
    const d = geoFaultDisplacementENU(fault, centroidDepth, x, y);
    if (d.singular) continue;
    const losM = projectDisplacementToLOS(d, los);
    if (Math.abs(losM) > Math.abs(predPeak)) predPeak = losM;
    if (mask && !mask[idx]) continue;
    const dv = displacement[idx];
    if (!Number.isNaN(dv)) {
      meas.push(dv);
      prd.push(losM);
      if (Math.abs(dv) > measuredPeak) measuredPeak = Math.abs(dv);
    }
  }

  const amplitudeRatio =
    Math.abs(predPeak) > 1e-9 ? measuredPeak / Math.abs(predPeak) : NaN;
  const corr = pearson(prd, meas);

  return {
    eventId: event.id,
    amplitudeRatio: Number.isNaN(amplitudeRatio) ? 0 : amplitudeRatio,
    patternCorrelation: Number.isNaN(corr) ? 0 : corr,
    predictedPeakM: predPeak,
    measuredPeakM: measuredPeak,
    note:
      'Predicted field uses a uniform-slip rectangular dislocation with the published nodal plane; ' +
      'fault dimensions follow empirical magnitude-area scaling with substantial scatter, so only ' +
      'order-of-magnitude amplitude agreement is meaningful. Evaluated on a deterministic subgrid ' +
      `of about ${Math.floor(n / stride)} points (the model field is smooth at grid scale).`,
  };
}

/** Build the Okada forward-model LOS prediction on an arbitrary grid. */
export function buildPredictionOnGrid(
  meta: import('./types').GridMeta,
  event: UsgsEventLite,
  geometry: RadarGeometry,
): Raster | undefined {
  const np = event.nodalPlane;
  if (!np) return undefined;
  const area = ruptureAreaFromMw(event.magnitude);
  const width = Math.sqrt(area / 2);
  const length = 2 * width;
  const slip = slipFromMoment(momentFromMw(event.magnitude), area);
  const fault = {
    strikeDeg: np.strike,
    dipDeg: np.dip,
    rakeDeg: np.rake,
    lengthM: length,
    widthM: width,
    topDepthM: 0,
    slipM: slip,
    centroidLat: event.lat,
    centroidLon: event.lon,
  };
  const los = losUnitVector(
    geometry.incidenceAngleDeg,
    geometry.headingDeg,
    geometry.lookDirection,
  );
  const cx = meta.xStart + ((meta.width - 1) / 2) * meta.xSpacing;
  const cy = meta.yStart + ((meta.height - 1) / 2) * meta.ySpacing;
  const n = meta.width * meta.height;
  const pred = new Float32Array(n);
  for (let idx = 0; idx < n; idx++) {
    const i = Math.floor(idx / meta.width);
    const j = idx % meta.width;
    const d = geoFaultDisplacementENU(
      fault,
      Math.max(4000, event.depthKm * 1000),
      meta.xStart + j * meta.xSpacing - cx,
      meta.yStart + i * meta.ySpacing - cy,
    );
    pred[idx] = d.singular ? NaN : projectDisplacementToLOS(d, los);
  }
  return { meta, data: pred };
}

/** Helper to attach prediction raster (for the map layer) on a dataset grid. */
export function buildPredictionRaster(
  ds: ScienceDataset,
  event: UsgsEventLite,
): Raster | undefined {
  if (!ds.phase) return undefined;
  return buildPredictionOnGrid(ds.phase.meta, event, ds.geometry);
}

export { distanceToFootprintKm };
