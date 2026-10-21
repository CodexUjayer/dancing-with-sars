'use client';

/**
 * Results panel — plain-language first, technical evidence one click away.
 *
 * FINAL-PASS UI (plain-language redesign). The result is presented in this
 * order, per the product story:
 *   1. What did we find?        (detection banner + key numbers)
 *   2. How certain are we?      (uncertainty in plain words)
 *   3. What could explain it?   (candidate explanations + model check)
 *   4. What are the limitations?(honest scope)
 *   5. Where can I inspect the technical evidence? ("Advanced results")
 *
 * Scientific language rules preserved from the remediation: detection is
 * never called proof of motion; the null screen stays "exploratory";
 * agreement with a forward model is "consistent", never "caused by";
 * uncorrected atmospheric contributions keep the "apparent" qualifier.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, HelpCircle, Ruler, ShieldQuestion, Lightbulb, Microscope } from 'lucide-react';
import type { AnalysisResult } from '@/lib/science/types';
import { HypothesisStatusBadge, MicroLabel, Stat, WhatIsThis, EventRow, fmtMm, fmtKm2 } from './ui-bits';
import { EvidenceViewer } from './evidence-viewer';
import type { EvidenceAnalysisResult, PanamaGranule } from './types';

/** Mirror of the pipeline's credibility criterion (pipeline.ts Stage C). */
function detectionOutcome(s: AnalysisResult['summary']): 'none' | 'inconclusive' | 'detected' {
  const minCredibleAreaKm2 = Math.max(1, s.pixelAreaKm2 * 4);
  if (s.affectedAreaKm2 === 0) return 'none';
  return s.affectedAreaKm2 < minCredibleAreaKm2 ? 'inconclusive' : 'detected';
}

export function QuantitativeResults({ result }: { result: AnalysisResult & { runId?: string } }) {
  const s = result.summary;
  const v = result.validation;
  const fm = result.attribution.forwardModelCheck;
  const outcome = detectionOutcome(s);
  const isDemo = result.datasetId.startsWith('synthetic-');

  return (
    <div className="space-y-6">
      {/* ---------- 1 · What did we find? ---------- */}
      <section aria-labelledby="what-found">
        <OutcomeBanner outcome={outcome} />
        <h2 id="what-found" className="sr-only">What did we find?</h2>
        {isDemo && (
          <p className="mt-3 rounded-lg border border-[#B0714E]/40 bg-[#F7EBE2] px-3 py-2 text-[11.5px] leading-4 text-[#8F4A2B]">
            Demonstration data: the &ldquo;right answer&rdquo; is known by construction, so you can see
            how the analysis behaves on a controlled example. It is not an observation of the Earth.
          </p>
        )}
        <p className="mt-3 text-[13px] leading-[1.5rem] text-[#4A443C]">{result.narrative.whatChanged}</p>
        {(outcome === 'detected' || outcome === 'inconclusive') && (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5">
            {s.maxAwayM > 0.0005 && (
              <Stat label="Largest movement away from satellite" value={fmtMm(s.maxAwayM, 0)} title="Peak apparent LOS range change away from the satellite (positive convention)." />
            )}
            {s.maxTowardM < -0.0005 && (
              <Stat label="Largest movement toward satellite" value={fmtMm(Math.abs(s.maxTowardM), 0)} title="Peak apparent LOS range change toward the satellite (negative convention)." />
            )}
            <Stat label="Area above threshold" value={fmtKm2(s.affectedAreaKm2)} title="Total area whose apparent change exceeded the detection threshold." />
            <Stat label="Measured area" value={fmtKm2(s.analysedAreaKm2)} title="Area with reliable enough signal to be measured at all." />
          </div>
        )}
        <p className="mt-2 text-[11px] leading-4 text-[#8A837B]">
          &ldquo;Apparent&rdquo; movement means movement in the radar measurement: it is what the
          satellite saw change, which can include effects of the atmosphere between the two images —{' '}
          <WhatIsThis>the radar signal travels through the atmosphere twice; water vapour and charged
          particles (the ionosphere) can shift it by amounts that look like ground movement. The
          NISAR data used here does not have those effects fully removed, so the analysis quantifies
          them as an uncertainty instead of pretending they are gone.</WhatIsThis>
        </p>
      </section>

      {/* ---------- 2 · How certain are we? ---------- */}
      <section aria-labelledby="how-certain">
        <SectionTitle icon={<Ruler className="h-3.5 w-3.5" aria-hidden />} id="how-certain">
          How certain are we?
        </SectionTitle>
        <p className="mt-2 text-[13px] leading-[1.5rem] text-[#4A443C]">{result.narrative.reliability}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5">
          <Stat label="Typical measurement noise" value={`± ${fmtMm(s.medianSigmaM)}`} title="Median per-pixel 1σ uncertainty of the apparent LOS range change." />
          <Stat label="Reliable-signal coverage" value={`${(s.validFraction * 100).toFixed(0)}% of the area`} title="Fraction of the frame that passed the signal-quality (coherence) mask." />
          {s.systematicIonoFloorM > 0 && (
            <Stat
              label="Atmosphere-related floor"
              value={`± ${fmtMm(s.systematicIonoFloorM)}`}
              title={`Uncertainty from the unapplied ionospheric phase screen (basis: ${s.ionoFloorBasis}). Signals smaller than this cannot be confidently told apart from ionosphere effects.`}
            />
          )}
          <Stat label="Change needed to be flagged" value={fmtMm(s.thresholdMedianM)} title="Median detection threshold actually applied (combines the statistical rule and the physical floor)." />
        </div>
        <p className="mt-2 text-[11px] leading-4 text-[#8A837B]">
          The measurement noise describes random, pixel-to-pixel scatter. Uncertainty from the{' '}
          <WhatIsThis label="ionosphere">a layer of charged particles high in the atmosphere that can
          distort the radar signal. The product ships an estimate of this distortion but does not
          remove it from the data, so it is counted as a systematic uncertainty here.</WhatIsThis>{' '}
          affects whole regions at once and does not average out the way random noise does.
        </p>
      </section>

      {/* ---------- 3 · What could explain it? ---------- */}
      <section aria-labelledby="what-explains">
        <SectionTitle icon={<Lightbulb className="h-3.5 w-3.5" aria-hidden />} id="what-explains">
          What could explain it?
        </SectionTitle>
        <p className="mt-1.5 text-[12px] leading-[1.45rem] text-[#8A837B]">
          Candidate explanations, each with the evidence for and against. None of these is a
          diagnosis — a single radar view cannot prove what caused a change.
        </p>
        <ul className="mt-3 space-y-2">
          {result.attribution.hypotheses.map((h) => (
            <HypothesisRow key={h.id} h={h} />
          ))}
        </ul>
        {fm && (
          <div className="mt-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3">
            <MicroLabel>Earthquake model check (Okada 1985 · USGS fault parameters)</MicroLabel>
            {fm.skipped ? (
              <p className="mt-1.5 text-[12px] leading-[1.4rem] text-[#6F6862]">
                Not run: {fm.skipReason}. No fault geometry was invented to fill the gap.
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-[12.5px] leading-[1.4rem] text-[#4A443C]">
                  A standard earthquake model, built from the published fault information for the
                  matched event, predicts a peak movement of {fmtMm(fm.predictedPeakM, 0)}; the
                  measurement peaks at {fmtMm(fm.measuredPeakM, 0)} (ratio{' '}
                  {fm.amplitudeRatio.toFixed(2)}), and the two spatial patterns correlate at r ={' '}
                  {fm.patternCorrelation.toFixed(2)}.
                </p>
                <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">
                  Even when both checks pass, this only means the pattern is{' '}
                  <em>consistent with</em> the model — it does not prove the earthquake caused it.
                </p>
              </>
            )}
            <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">{fm.note}</p>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-4 text-[#8A837B]">{result.attribution.methodNote}</p>
      </section>

      {/* ---------- 4 · What are the limitations? ---------- */}
      <section aria-labelledby="limits">
        <SectionTitle icon={<ShieldQuestion className="h-3.5 w-3.5" aria-hidden />} id="limits">
          What are the limitations?
        </SectionTitle>
        <ul className="mt-2 space-y-1.5 text-[12.5px] leading-[1.45rem] text-[#4A443C]">
          <Limitation>
            This is a single comparison of two radar images. Slow, ongoing processes (months to
            years) cannot be separated from one-off events.
          </Limitation>
          <Limitation>
            Movement is measured only toward or away from the satellite — one direction, not the
            full three-dimensional motion.
          </Limitation>
          <Limitation>
            Atmospheric and ionospheric effects are not fully removed from the data, so part of any
            apparent change may not be ground movement at all.
          </Limitation>
          {s.connectedComponentCount > 1 ? (
            <Limitation>
              The unwrapping step split the scene into {s.connectedComponentCount} regions; treat
              abrupt boundaries between regions with caution.{' '}
              <WhatIsThis label="What is unwrapping?">the radar signal repeats in cycles; the
              computer must add the cycles up (&ldquo;unwrap&rdquo; them) to estimate a continuous
              change. Where the signal is weak, it can lose count and jump by a whole cycle, which
              looks like a sudden step in movement.</WhatIsThis>
            </Limitation>
          ) : (
            <Limitation>
              The unwrapping step was consistent across the scene (one region), which lowers — but
              does not eliminate — the chance of step-like artefacts.{' '}
              <WhatIsThis label="What is unwrapping?">the radar signal repeats in cycles; the
              computer must add the cycles up (&ldquo;unwrap&rdquo; them) to estimate a continuous
              change. Where the signal is weak, it can lose count and jump by a whole cycle, which
              looks like a sudden step in movement.</WhatIsThis>
            </Limitation>
          )}
        </ul>
        {result.warnings.length > 0 && (
          <div className="mt-3 rounded-lg border border-[#E7D9B8] bg-[#FCF8EE] p-3">
            <div className="flex items-center gap-2 text-[12px] font-medium text-[#7A6438]">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Notes from this run
            </div>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11.5px] leading-[1.4rem] text-[#7A6438]">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- 5 · Advanced results ---------- */}
      <AdvancedResults result={result} v={v} />
    </div>
  );
}

/** Evidence-mode results (Panama): real records + labelled prediction. */
export function EvidenceResults({
  result,
  onGranulePolys,
}: {
  result: EvidenceAnalysisResult;
  onGranulePolys?: (polys: Array<{ granule: PanamaGranule; poly: [number, number][] }>) => void;
}) {
  return (
    <div className="space-y-6">
      <section aria-label="What did we find">
        <div className="rounded-lg border border-[#2C5F58]/40 bg-[#EDF4F1] px-4 py-3.5" role="status">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[#2C5F58]">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Real earthquake, real radar data — measurement pending
          </p>
          <p className="mt-1.5 text-[12px] leading-[1.45rem] text-[#2C5F58]">
            A strong earthquake occurred here, and radar data covering it exists. Measuring the ground
            movement requires downloading the full data product with a (free) NASA Earthdata account,
            which is not configured on this server. This page shows the real evidence and a clearly
            labelled model prediction instead — no measurement of this event is being claimed.
          </p>
        </div>
        <p className="mt-3 text-[13px] leading-[1.5rem] text-[#4A443C]">{result.narrative.whatChanged}</p>
        {result.warnings.length > 0 && (
          <ul className="mt-3 list-inside list-disc space-y-1 rounded-lg border border-[#E7D9B8] bg-[#FCF8EE] p-3 text-[11.5px] leading-[1.4rem] text-[#7A6438]">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </section>
      <EvidenceViewer result={result} onGranulePolys={onGranulePolys} />
    </div>
  );
}

function OutcomeBanner({ outcome }: { outcome: 'none' | 'inconclusive' | 'detected' }) {
  if (outcome === 'detected') {
    return (
      <div className="rounded-lg border border-[#2C5F58]/40 bg-[#EDF4F1] px-4 py-3.5" role="status">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[#2C5F58]">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Possible change detected
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45rem] text-[#2C5F58]">
          The radar measurements show a pattern that passes the current detection threshold. This does
          not yet prove that the ground moved by this amount, or identify the cause.
        </p>
      </div>
    );
  }
  if (outcome === 'none') {
    return (
      <div className="rounded-lg border border-[#D8D2C6] bg-[#F7F4EE] px-4 py-3.5" role="status">
        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[#4A443C]">
          <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
          No change detected above the threshold
        </p>
        <p className="mt-1.5 text-[12px] leading-[1.45rem] text-[#6F6862]">
          The analysis did not find a strong enough signal to pass the selected threshold. Smaller
          changes may still be present.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-[#B08D57]/50 bg-[#F7F2E7] px-4 py-3.5" role="status">
      <p className="flex items-center gap-2 text-[13.5px] font-semibold text-[#7A6438]">
        <HelpCircle className="h-4 w-4 shrink-0" aria-hidden />
        Inconclusive
      </p>
      <p className="mt-1.5 text-[12px] leading-[1.45rem] text-[#7A6438]">
        The available measurements are not clear enough to determine whether a change occurred. Only
        isolated stray pixels crossed the threshold — at this signal quality that is consistent with
        measurement noise.
      </p>
    </div>
  );
}

function SectionTitle({ icon, id, children }: { icon: React.ReactNode; id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="flex items-center gap-2 text-[13.5px] font-semibold text-[#1C1A17]">
      <span className="text-[#B08D57]">{icon}</span>
      {children}
    </h3>
  );
}

function Limitation({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#B08D57]" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** Collapsible technical evidence — the full statistical record. */
function AdvancedResults({
  result,
  v,
}: {
  result: AnalysisResult & { runId?: string };
  v: AnalysisResult['validation'];
}) {
  const [open, setOpen] = useState(false);
  const s = result.summary;
  return (
    <section aria-labelledby="advanced-results" className="rounded-lg border border-[#EFEAE2] bg-[#FDFCF9]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="advanced-results-body"
        className="flex w-full items-center justify-between px-3.5 py-3 text-left"
      >
        <span id="advanced-results" className="flex items-center gap-2 text-[12.5px] font-semibold text-[#1C1A17]">
          <Microscope className="h-3.5 w-3.5 text-[#8A837B]" aria-hidden />
          Advanced results — inspect the technical evidence
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#8A837B] transition-transform duration-150 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div id="advanced-results-body" className="space-y-4 border-t border-[#EFEAE2] px-3.5 py-4">
          <div>
            <MicroLabel>Processing statistics</MicroLabel>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Stat label="Valid fraction" value={`${(s.validFraction * 100).toFixed(0)}%`} />
              <Stat label="Masked pixels" value={s.maskedPixelCount.toLocaleString()} />
              <Stat label="Reference scatter (σ)" value={fmtMm(s.referenceSigmaM)} />
              <Stat label="Detected pixels" value={s.detectedPixelCount.toLocaleString()} />
              <Stat label="Detected clusters ≥ 4 px" value={String(s.clusters.count)} />
              <Stat label="Largest cluster" value={s.clusters.largestKm2 > 0 ? `${s.clusters.largestKm2.toFixed(1)} km²` : '—'} />
              <Stat label="Unwrap components" value={String(s.connectedComponentCount)} />
              <Stat label="Iono floor" value={s.systematicIonoFloorM > 0 ? fmtMm(s.systematicIonoFloorM) : 'n/a'} />
              <Stat label="Median threshold" value={fmtMm(s.thresholdMedianM)} />
              <Stat label="Median σ" value={fmtMm(s.medianSigmaM)} />
              <Stat label="Coherence (median)" value={s.coherenceMedian.toFixed(2)} />
              <Stat label="Anomaly elongation" value={s.anomalyElongation !== undefined && s.anomalyElongation > 0 ? `${s.anomalyElongation.toFixed(2)} : 1` : '—'} />
            </div>
          </div>

          <div>
            <MicroLabel>Correction status of the consumed data layer</MicroLabel>
            <p className="mt-1.5 text-[11px] leading-4 text-[#6F6862]">{s.correctionStatus.note}</p>
          </div>

          {s.nullScreen.scenes > 0 && (
            <div>
              <MicroLabel>No-change simulation (exploratory screen)</MicroLabel>
              <p className="mt-1.5 text-[11px] leading-4 text-[#6F6862]">
                {s.nullScreen.scenes} simulated no-change scenes with spatially correlated noise
                (correlation length {s.nullScreen.correlationLengthPx} px, deterministic seeds) produced a
                mean false-exceedance fraction of {(s.nullScreen.detectedFractionMean * 100).toFixed(2)}%
                (worst scene {(s.nullScreen.detectedFractionMax * 100).toFixed(2)}%;{' '}
                {s.nullScreen.scenesWithClusters} of {s.nullScreen.scenes} scenes formed ≥ 4-pixel clusters).
                {' '}{s.nullScreen.note}
              </p>
            </div>
          )}

          {v && (
            <div className="rounded-lg border border-[#E2CDBA] bg-[#FAF3EA] p-3">
              <MicroLabel>Ground-truth check (demonstration data)</MicroLabel>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <Stat label="MAE" value={fmtMm(v.maeM)} />
                <Stat label="RMSE" value={fmtMm(v.rmseM)} />
                <Stat label="Bias" value={fmtMm(v.biasM)} />
                <Stat label="Points" value={v.n.toLocaleString()} />
              </div>
              <p className="mt-2 text-[11px] leading-4 text-[#8A837B]">{v.note}</p>
            </div>
          )}

          {result.attribution.events.length > 0 && (
            <div>
              <MicroLabel>Independent earthquake records (USGS)</MicroLabel>
              <ul className="mt-2 space-y-1.5">
                {result.attribution.events.slice(0, 6).map((ev) => (
                  <EventRow key={ev.id} ev={ev} />
                ))}
              </ul>
            </div>
          )}

          <p className="border-t border-[#EFEAE2] pt-3 text-[11px] text-[#8A837B]">
            Processed in {result.processingMs} ms · {result.params.coherenceThreshold} coherence threshold · {result.params.significanceK}σ detection · run {result.runId ?? result.datasetId}
          </p>
        </div>
      )}
    </section>
  );
}

function HypothesisRow({ h }: { h: import('@/lib/science/types').Hypothesis }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-lg border border-[#EFEAE2] bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[#FDFCF9]"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-[#8A837B] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden
        />
        <HypothesisStatusBadge status={h.status} />
        <span className="text-[13px] font-medium text-[#1C1A17]">{h.label}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[#EFEAE2] px-3.5 py-3">
          <p className="text-[12.5px] leading-[1.45rem] text-[#4A443C]">{h.description}</p>
          <ul className="list-inside list-disc space-y-1.5">
            {h.evidence.map((e, i) => (
              <li key={i} className="text-[12px] leading-[1.45rem] text-[#6F6862]">{e}</li>
            ))}
          </ul>
          {h.discriminatingObservation && (
            <p className="border-l-2 border-[#B08D57] pl-2.5 text-[11.5px] italic leading-[1.4rem] text-[#8A837B]">
              What would settle it: {h.discriminatingObservation}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export { EventRow };
