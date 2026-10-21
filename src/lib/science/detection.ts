/**
 * Change detection and summary statistics over a referenced displacement
 * field with per-pixel uncertainty.
 *
 * Detection rule (documented, transparent): a pixel counts as "changed" when
 *   |d| > max(k * sigma_total, physicalFloor)
 * where sigma_total combines the coherence-based phase noise propagated to
 * displacement and the reference-region scatter. The physical floor
 * (default 10 mm) guards against declaring sub-noise variations significant
 * when the coherence is very high but systematic residuals (atmosphere,
 * ionosphere, orbit) dominate the true error budget — these are typically
 * mm-to-cm level for L-band 12-46 day pairs (Hanssen 2001, Ch. 6-9).
 */

import type { GridMeta } from './types';
import { median } from './statistics';

export interface DetectionInputs {
  meta: GridMeta;
  /** Referenced displacement (m); NaN = masked */
  displacement: Float32Array;
  /** Per-pixel one-sigma (m); NaN = masked */
  sigma: Float32Array;
  /** Quality mask: 1 = valid, 0 = masked */
  mask: Uint8Array;
  /** Significance multiplier k */
  k: number;
  /** Physical detection floor (m) */
  floorM: number;
}

export interface DetectionOutputs {
  thresholds: Float32Array;
  detected: Uint8Array;
  stats: {
    validPixelCount: number;
    affectedAreaKm2: number;
    towardAreaKm2: number;
    awayAreaKm2: number;
    maxAwayM: number;
    maxTowardM: number;
    medianSigmaM: number;
    medianSigmaAnomalyM: number;
    anomalyCentroid?: { x: number; y: number };
    anomalyOrientationDeg?: number;
    anomalyElongation?: number;
    displacementIntegralMKm2: number;
    coherenceMedian: number;
    coherenceMean: number;
    validFraction: number;
    pixelAreaKm2: number;
    analysedAreaKm2: number;
  };
}

export function runDetection(
  inputs: DetectionInputs,
  coherence: Float32Array,
): DetectionOutputs {
  const { meta, displacement, sigma, mask, k, floorM } = inputs;
  const n = meta.width * meta.height;
  const thresholds = new Float32Array(n);
  const detected = new Uint8Array(n);

  const pixelAreaM2 = Math.abs(meta.xSpacing * meta.ySpacing);
  const pixelAreaKm2 = pixelAreaM2 / 1e6;

  let validCount = 0;
  let detectedCount = 0;
  let towardCount = 0;
  let awayCount = 0;
  let maxAway = 0;
  let maxToward = 0;
  let integralMKm2 = 0;
  const sigmas: number[] = [];
  const anomalySigmas: number[] = [];
  const cohs: number[] = [];
  let cohSum = 0;
  let cohN = 0;

  // Anomaly moments
  let sw = 0;
  let cx = 0;
  let cy = 0;
  let cxx = 0;
  let cyy = 0;
  let cxy = 0;

  for (let idx = 0; idx < n; idx++) {
    if (!mask[idx]) {
      thresholds[idx] = NaN;
      continue;
    }
    validCount++;
    const c = coherence[idx];
    if (!Number.isNaN(c)) {
      cohs.push(c);
      cohSum += c;
      cohN++;
    }
    const s = sigma[idx];
    if (!Number.isNaN(s)) sigmas.push(s);
    const d = displacement[idx];
    const thr = Math.max(k * (Number.isNaN(s) ? 0 : s), floorM);
    thresholds[idx] = thr;
    if (Math.abs(d) > thr) {
      detected[idx] = d > 0 ? 1 : 2; // 1 = away (positive), 2 = toward (negative)
      detectedCount++;
      anomalySigmas.push(s);
      integralMKm2 += d * pixelAreaKm2; // m * km^2
      if (d > 0) {
        awayCount++;
        if (d > maxAway) maxAway = d;
      } else {
        towardCount++;
        if (d < maxToward) maxToward = d;
      }
      const i = Math.floor(idx / meta.width);
      const j = idx % meta.width;
      const x = meta.xStart + j * meta.xSpacing;
      const y = meta.yStart + i * meta.ySpacing;
      const w = Math.abs(d);
      sw += w;
      cx += w * x;
      cy += w * y;
      cxx += w * x * x;
      cyy += w * y * y;
      cxy += w * x * y;
    }
  }

  const centroid =
    sw > 0 ? { x: cx / sw, y: cy / sw } : undefined;

  let orientation: number | undefined;
  let elongation: number | undefined;
  if (centroid && sw > 0) {
    const varX = cxx / sw - centroid.x * centroid.x;
    const varY = cyy / sw - centroid.y * centroid.y;
    const covXY = cxy / sw - centroid.x * centroid.y;
    // Principal axis of the covariance matrix.
    const trace = varX + varY;
    const diff = varX - varY;
    const disc = Math.sqrt(diff * diff + 4 * covXY * covXY);
    const lambdaMax = (trace + disc) / 2;
    const lambdaMin = (trace - disc) / 2;
    if (lambdaMax > 0 && lambdaMin >= 0) {
      elongation = lambdaMin > 0 ? Math.sqrt(lambdaMax / lambdaMin) : Infinity;
      // Angle of the major axis (eigenvector) from east.
      const theta = 0.5 * Math.atan2(2 * covXY, diff);
      orientation = (theta * 180) / Math.PI;
    }
  }

  const coherenceMedian = median(cohs);
  const stats: DetectionOutputs['stats'] = {
    validPixelCount: validCount,
    affectedAreaKm2: detectedCount * pixelAreaKm2,
    towardAreaKm2: towardCount * pixelAreaKm2,
    awayAreaKm2: awayCount * pixelAreaKm2,
    maxAwayM: maxAway,
    maxTowardM: maxToward,
    medianSigmaM: median(sigmas),
    medianSigmaAnomalyM: median(anomalySigmas),
    anomalyCentroid: centroid,
    anomalyOrientationDeg: orientation,
    anomalyElongation: elongation,
    displacementIntegralMKm2: integralMKm2,
    coherenceMedian,
    coherenceMean: cohN ? cohSum / cohN : NaN,
    validFraction: validCount / n,
    pixelAreaKm2,
    analysedAreaKm2: validCount * pixelAreaKm2,
  };
  return { thresholds, detected, stats };
}
