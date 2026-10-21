'use client';

/**
 * Results panel: narrative, statistics, attribution, validation, warnings.
 */

import { useState } from 'react';
import { ChevronRight, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import type { AnalysisResult, UsgsEventLite } from '@/lib/science/types';
import { HypothesisStatusBadge, MicroLabel, Stat, fmtMm, fmtKm2, fmtDateTime } from './ui-bits';

export function QuantitativeResults({ result }: { result: AnalysisResult & { runId?: string } }) {
  const s = result.summary;
  const v = result.validation;
  const fm = result.attribution.forwardModelCheck;
  return (
    <div className="space-y-6">
      <section aria-labelledby="what-changed">
        <h2 id="what-changed" className="text-[15px] font-semibold text-[#1C1A17]">What changed?</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#4A443C]">{result.narrative.whatChanged}</p>
      </section>

      <section aria-labelledby="how-much">
        <h2 id="how-much" className="text-[15px] font-semibold text-[#1C1A17]">How much?</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#4A443C]">{result.narrative.howMuch}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5 sm:grid-cols-3">
          <Stat label="Affected area" value={fmtKm2(s.affectedAreaKm2)} />
          <Stat label="Peak away" value={fmtMm(s.maxAwayM)} />
          <Stat label="Peak toward" value={fmtMm(s.maxTowardM)} />
          <Stat label="Median σ" value={fmtMm(s.medianSigmaM)} />
          <Stat label="Analysed area" value={fmtKm2(s.analysedAreaKm2)} />
          <Stat label="Coherence (median)" value={s.coherenceMedian.toFixed(2)} />
        </div>
      </section>

      <section aria-labelledby="what-explains">
        <h2 id="what-explains" className="text-[15px] font-semibold text-[#1C1A17]">What might explain it?</h2>
        <p className="mt-1 text-[12px] leading-4 text-[#8A837B]">
          Each candidate explanation carries its evidence. Attribution is a transparent screen, not a prediction.
        </p>
        <ul className="mt-3 space-y-2">
          {result.attribution.hypotheses.map((h) => (
            <HypothesisRow key={h.id} h={h} />
          ))}
        </ul>
        {fm && (
          <div className="mt-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3">
            <MicroLabel>Forward-model check (Okada 1985 · USGS mechanism)</MicroLabel>
            {fm.skipped ? (
              <p className="mt-1.5 text-[12px] leading-4 text-[#6F6862]">
                Skipped: {fm.skipReason}. No fault geometry was invented.
              </p>
            ) : (
              <div className="mt-1.5 font-mono text-[12px] tabular-nums text-[#4A443C]">
                amplitude ratio {fm.amplitudeRatio.toFixed(2)} · pattern correlation r = {fm.patternCorrelation.toFixed(2)} · predicted peak {fmtMm(fm.predictedPeakM, 0)} vs measured {fmtMm(fm.measuredPeakM, 0)}
              </div>
            )}
            <p className="mt-1.5 text-[11px] leading-4 text-[#8A837B]">{fm.note}</p>
          </div>
        )}
        <p className="mt-3 text-[11px] leading-4 text-[#8A837B]">{result.attribution.methodNote}</p>
      </section>

      <section aria-labelledby="reliability">
        <h2 id="reliability" className="text-[15px] font-semibold text-[#1C1A17]">How reliable is this result?</h2>
        <p className="mt-1.5 text-[13px] leading-5 text-[#4A443C]">{result.narrative.reliability}</p>
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5 sm:grid-cols-3">
          <Stat label="Valid fraction" value={`${(s.validFraction * 100).toFixed(0)}%`} />
          <Stat label="Masked pixels" value={s.maskedPixelCount.toLocaleString()} />
          <Stat label="Reference scatter (σ)" value={fmtMm(s.referenceSigmaM)} />
          <Stat label="Detected pixels" value={s.detectedPixelCount.toLocaleString()} />
          <Stat label="Detected clusters ≥ 4 px" value={String(s.clusters.count)} />
          <Stat label="Largest cluster" value={s.clusters.largestKm2 > 0 ? `${s.clusters.largestKm2.toFixed(1)} km²` : '—'} />
          <Stat label="Unwrap components" value={String(s.connectedComponentCount)} />
          <Stat label="Iono floor" value={s.systematicIonoFloorM > 0 ? fmtMm(s.systematicIonoFloorM) : 'n/a'} />
          <Stat label="Median threshold" value={fmtMm(s.thresholdMedianM)} />
        </div>
        <div className="mt-2.5 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3">
          <MicroLabel>What the corrections do and do not cover</MicroLabel>
          <p className="mt-1 text-[11px] leading-4 text-[#6F6862]">{s.correctionStatus.note}</p>
        </div>
        {s.nullScreen.scenes > 0 && (
          <div className="mt-2.5 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3">
            <MicroLabel>Null-scene screen (exploratory)</MicroLabel>
            <p className="mt-1 text-[11px] leading-4 text-[#6F6862]">
              {s.nullScreen.scenes} simulated no-change scenes with spatially correlated noise
              (correlation length {s.nullScreen.correlationLengthPx} px, deterministic seeds) produced a
              mean false-exceedance fraction of {(s.nullScreen.detectedFractionMean * 100).toFixed(2)}%
              (worst scene {(s.nullScreen.detectedFractionMax * 100).toFixed(2)}%;{' '}
              {s.nullScreen.scenesWithClusters} of {s.nullScreen.scenes} scenes formed ≥ 4-pixel clusters).
              {' '}{s.nullScreen.note}
            </p>
          </div>
        )}
      </section>

      {v && (
        <section aria-labelledby="validation" className="rounded-lg border border-[#E2CDBA] bg-[#FAF3EA] p-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#8F4A2B]" aria-hidden />
            <h2 id="validation" className="text-[13px] font-semibold text-[#8F4A2B]">Ground-truth validation (synthetic fixture)</h2>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
            <Stat label="MAE" value={fmtMm(v.maeM)} />
            <Stat label="RMSE" value={fmtMm(v.rmseM)} />
            <Stat label="Bias" value={fmtMm(v.biasM)} />
            <Stat label="Points" value={v.n.toLocaleString()} />
          </div>
          <p className="mt-2 text-[11px] leading-4 text-[#8A837B]">{v.note}</p>
        </section>
      )}

      {result.attribution.events.length > 0 && (
        <section aria-labelledby="events">
          <h2 id="events" className="text-[15px] font-semibold text-[#1C1A17]">Independent seismic evidence</h2>
          <ul className="mt-2 space-y-1.5">
            {result.attribution.events.slice(0, 6).map((ev) => (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </ul>
        </section>
      )}

      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-[#E7D9B8] bg-[#FCF8EE] p-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[#7A6438]">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> Notes
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-[11.5px] leading-4 text-[#7A6438]">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="border-t border-[#EFEAE2] pt-3 text-[11px] text-[#8A837B]">
        Processed in {result.processingMs} ms · {result.params.coherenceThreshold} coherence threshold · {result.params.significanceK}σ detection · run {result.runId ?? result.datasetId}
      </div>
    </div>
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
          <p className="text-[12.5px] leading-5 text-[#4A443C]">{h.description}</p>
          <ul className="list-inside list-disc space-y-1.5">
            {h.evidence.map((e, i) => (
              <li key={i} className="text-[12px] leading-5 text-[#6F6862]">{e}</li>
            ))}
          </ul>
          {h.discriminatingObservation && (
            <p className="border-l-2 border-[#B08D57] pl-2.5 text-[11.5px] italic leading-4 text-[#8A837B]">
              What would settle it: {h.discriminatingObservation}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export function EventRow({ ev }: { ev: UsgsEventLite }) {
  return (
    <li className="flex items-baseline justify-between gap-3 rounded-md border border-[#EFEAE2] px-3 py-2">
      <div>
        <span className="font-mono text-[12.5px] font-semibold tabular-nums text-[#9E3B2C]">M{ev.magnitude.toFixed(1)}</span>
        <span className="ml-2 text-[12px] text-[#4A443C]">{ev.place}</span>
        <div className="text-[11px] text-[#8A837B]">
          {fmtDateTime(ev.time)} · depth {ev.depthKm.toFixed(0)} km
          {ev.nodalPlane ? ` · strike ${ev.nodalPlane.strike.toFixed(0)}° dip ${ev.nodalPlane.dip.toFixed(0)}° rake ${ev.nodalPlane.rake.toFixed(0)}°` : ''}
        </div>
      </div>
      <a href={ev.url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[#6F6862] transition-colors hover:text-[#1C1A17]" aria-label={`USGS page for M${ev.magnitude} earthquake`}>
        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
      </a>
    </li>
  );
}
