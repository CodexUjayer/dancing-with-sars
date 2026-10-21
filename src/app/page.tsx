'use client';

/**
 * MOTUS — Earth-change intelligence (NASA Space Apps 2026, "Dancing with the SARs").
 *
 * FINAL-PASS UI (plain-language redesign):
 *   The page follows one simple story —
 *     Step 1 · Choose an area  →  Step 2 · Analyze it  →  Step 3 · Understand the result
 *   Every screen answers: what am I looking at, what should I do next, what
 *   does the result mean, and what should I *not* conclude from it. Technical
 *   detail stays available under "Advanced" sections and the "How it works"
 *   drawer, so the science remains inspectable.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Play, RotateCcw, ChevronDown, BookOpen, Check, MapPin, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MethodologyDrawer } from '@/components/app/methodology';
import { QuantitativeResults, EvidenceResults } from '@/components/app/results-panel';
import {
  DataClassBadge,
  MicroLabel,
  ReadinessBadge,
  readinessOf,
  WhatIsThis,
  fmtDate,
  fmtDateTime,
} from '@/components/app/ui-bits';
import type {
  AnalysisPayload,
  DatasetDetail,
  DatasetListEntry,
  HealthPayload,
  PanamaGranule,
} from '@/components/app/types';
import type { LayerKind } from '@/components/app/raster-render';
import { decodeTransport, type DecodedGrids } from '@/components/app/decode';
import { isEvidenceResult } from '@/components/app/types';

const MapPanel = dynamic(() => import('@/components/app/map-panel'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[#E7E2DA] bg-white">
      <Loader2 className="h-5 w-5 animate-spin text-[#B8AFA2]" aria-label="Loading map" />
    </div>
  ),
});

interface AdvancedParams {
  coherenceThreshold: number;
  detectionFloor: number;
  significanceK: number;
  referenceStrategy: 'farField' | 'fullFrameMedian';
  detrend: boolean;
}

const DEFAULT_ADVANCED: AdvancedParams = {
  coherenceThreshold: 0.5,
  detectionFloor: 0.01,
  significanceK: 3,
  referenceStrategy: 'farField',
  detrend: false,
};

/**
 * Display / default-selection rank: a real, ready, measurable dataset first,
 * then the real evidence view, then demonstrations, then unavailable data.
 * Stable, so the registry order is preserved within each class.
 */
function readinessRank(d: DatasetListEntry): number {
  if (d.availability.state !== 'available') return 3;
  if (d.dataClass === 'synthetic') return 2;
  if (d.mode === 'evidence') return 1;
  return 0;
}

/**
 * Real processing stages, mirroring src/lib/science/pipeline.ts (Stages A–E).
 * The server runs them in a single request, so while a run is in flight the
 * list is shown as "in progress" as a whole — no per-stage completion is
 * faked. Checkmarks appear only after the result has actually returned.
 */
function processingStages(mode: 'quantitative' | 'evidence'): Array<{ label: string; detail: string }> {
  if (mode === 'evidence') {
    return [
      { label: 'Reading the real catalog records', detail: 'Loading the cached NASA and USGS records for the event and the radar data that covers it.' },
      { label: 'Checking the latest data availability', detail: 'Asking the USGS earthquake catalog for the latest picture of the event sequence.' },
      { label: 'Computing the earthquake model prediction', detail: 'Calculating the ground movement a standard earthquake model expects, from the published fault information.' },
    ];
  }
  return [
    { label: 'Checking the radar data', detail: 'Reading the measurement files and setting aside pixels whose signal is too unreliable to measure.' },
    { label: 'Measuring changes in the radar signal', detail: 'Comparing the two radar images and converting the difference into apparent movement toward or away from the satellite.' },
    { label: 'Estimating measurement uncertainty', detail: 'Estimating how much of the apparent change could come from measurement noise and uncorrected atmospheric effects.' },
    { label: 'Checking whether the pattern is a possible real change', detail: 'Flagging areas where the apparent change clearly exceeds the uncertainty, and testing the rule against simulated no-change scenes.' },
  ];
}

function layerLabel(l: LayerKind, isPrediction: boolean): string {
  if (l === 'displacement') return isPrediction ? 'Model prediction' : 'Measured movement';
  if (l === 'coherence') return 'Signal quality';
  if (l === 'sigma') return 'Uncertainty';
  return 'Measured areas';
}

function layerInterpretation(l: LayerKind, isPrediction: boolean): string {
  if (l === 'displacement') {
    return isPrediction
      ? 'Colors show where a standard earthquake model predicts the ground should have moved. This is a calculation, not a measurement of this event.'
      : 'Colors show how far each patch of ground appears to have moved toward or away from the satellite between the two radar images. Areas without color could not be measured reliably.';
  }
  if (l === 'coherence') return 'Darker areas have a stronger, more reliable radar signal; lighter areas are noisier. Very light areas were excluded from the analysis.';
  if (l === 'sigma') return 'Darker areas have more uncertain measurements. Changes smaller than this uncertainty cannot be distinguished from noise.';
  return 'Gray shows where a valid measurement exists. Transparent areas were excluded (no reliable signal).';
}

export default function Home() {
  const [datasets, setDatasets] = useState<DatasetListEntry[] | null>(null);
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [detailEvent, setDetailEvent] = useState<unknown>(null);
  const [detailGranules, setDetailGranules] = useState<PanamaGranule[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [advanced, setAdvanced] = useState<AdvancedParams>(DEFAULT_ADVANCED);
  const [layer, setLayer] = useState<LayerKind>('displacement');
  const [opacity, setOpacity] = useState(0.85);
  const [grids, setGrids] = useState<DecodedGrids | null>(null);
  const [gridsMeta, setGridsMeta] = useState<Parameters<typeof import('@/components/app/raster-render').renderOverlay>[1] | undefined>(undefined);
  const [granulePolys, setGranulePolys] = useState<Array<{ granule: PanamaGranule; poly: [number, number][] }>>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Display order: real & ready first, demos next, unavailable last (stable). */
  const sortedDatasets = useMemo(() => {
    if (!datasets) return null;
    return [...datasets].sort((a, b) => readinessRank(a) - readinessRank(b));
  }, [datasets]);

  useEffect(() => {
    fetch('/api')
      .then((r) => r.json())
      .then((d: HealthPayload) => setHealth(d))
      .catch(() => setHealth(null));
    fetch('/api/datasets')
      .then((r) => r.json())
      .then((d: { ok: boolean; datasets: DatasetListEntry[] }) => {
        if (d.ok) {
          setDatasets(d.datasets);
          // Default to the first dataset the user can actually analyze — a
          // real, ready, quantitative dataset when one exists.
          const ranked = [...d.datasets].sort((a, b) => readinessRank(a) - readinessRank(b));
          setSelectedId(ranked[0]?.id ?? null);
        }
      })
      .catch(() => setDatasets([]));
  }, []);

  // Load dataset detail on selection; adopt the dataset's suggested starting
  // parameters (e.g. a decorrelated ionosphere-dominated pair suggests a lower
  // coherence threshold — every value stays user-adjustable under Advanced).
  useEffect(() => {
    if (!selectedId) return;
    setResult(null);
    setError(null);
    setGrids(null);
    setGridsMeta(undefined);
    setGranulePolys([]);
    setDetail(null);
    setLayer('displacement');
    const suggestedCoh = datasets?.find((d) => d.id === selectedId)?.suggestedParams?.coherenceThreshold;
    setAdvanced((a) => ({
      ...a,
      coherenceThreshold: suggestedCoh ?? DEFAULT_ADVANCED.coherenceThreshold,
    }));
    fetch(`/api/datasets/${selectedId}`)
      .then((r) => r.json())
      .then((d: { ok: boolean; dataset?: DatasetDetail; event?: unknown; granules?: PanamaGranule[] }) => {
        if (d.ok && d.dataset) {
          setDetail(d.dataset);
          setDetailEvent(d.event ?? null);
          setDetailGranules(d.granules ?? []);
        }
      })
      .catch((e) => setError((e as Error).message));
  }, [selectedId, datasets]);

  const runAnalysis = useCallback(async () => {
    if (!selectedId || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setElapsed(0);
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const res = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          datasetId: selectedId,
          params: {
            coherenceThreshold: advanced.coherenceThreshold,
            detectionFloor: advanced.detectionFloor,
            significanceK: advanced.significanceK,
            referenceStrategy: advanced.referenceStrategy,
            detrend: advanced.detrend,
          },
        }),
      });
      const data = (await res.json()) as { ok: boolean; result?: AnalysisPayload; error?: string };
      if (!data.ok || !data.result) {
        setError(data.error ?? 'The analysis failed for an unknown reason.');
      } else {
        const r = data.result;
        setResult(r);
        if (isEvidenceResult(r)) {
          setGrids(r.prediction ? decodeTransport(r.prediction) : null);
          setGridsMeta(r.prediction?.meta);
          setLayer('displacement');
        } else {
          setGrids(decodeTransport(r.transport));
          setGridsMeta(r.transport.meta);
          setLayer('displacement');
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
    }
  }, [selectedId, running, advanced]);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const eventsForMap = useMemo(() => {
    const fromResult = (() => {
      if (!result) return [];
      if (isEvidenceResult(result)) {
        return result.event ? [result.event, ...result.liveEvents.filter((e) => e.id !== result.event?.id)] : result.liveEvents;
      }
      return result.attribution.events;
    })();
    // For evidence datasets the primary event is known before any analysis
    // runs (it is part of the dataset record) — show it on selection.
    if (detail?.mode === 'evidence' && detailEvent && !fromResult.some((e) => e.id === (detailEvent as { id: string }).id)) {
      return [detailEvent as never, ...fromResult];
    }
    return fromResult;
  }, [result, detail, detailEvent]);

  const primaryEvent = useMemo(() => {
    if (result && isEvidenceResult(result)) return result.event;
    return detailEvent as { id: string } | null ?? null;
  }, [result, detailEvent]);

  const selectedEntry = datasets?.find((d) => d.id === selectedId) ?? null;
  const selectedReadiness = selectedEntry
    ? readinessOf(selectedEntry)
    : detail
      ? readinessOf({ dataClass: detail.provenance.dataClass, mode: detail.mode, availability: detail.availability })
      : null;
  const isPredictionLayer =
    !!result && isEvidenceResult(result) && !!result.prediction && layer === 'displacement';
  const stages = detail ? processingStages(detail.mode) : processingStages('quantitative');
  const anyReady = (sortedDatasets ?? []).some((d) => d.availability.state === 'available');

  const scrollToChoose = () => {
    document.getElementById('choose-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6]">
      <header className="sticky top-0 z-40 border-b border-[#E7E2DA] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="text-[17px] font-semibold tracking-[0.02em] text-[#1C1A17]">MOTUS</span>
            <span className="hidden text-[11px] text-[#8A837B] sm:inline">
              See how Earth&apos;s surface may have moved · NASA Space Apps 2026
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MethodologyDrawer
              trigger={
                <Button variant="outline" size="sm" className="ml-1 h-7 gap-1.5 rounded-full border-[#D8D2C6] px-3 text-[11px] font-normal text-[#4A443C] hover:bg-[#F7F4EE]">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  How it works
                </Button>
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-8 sm:px-6 sm:py-10">
        {/* ---------- Hero: what is this, what can I do here ---------- */}
        <section aria-label="Introduction" className="mb-10 max-w-3xl">
          <h1 className="text-[26px] font-semibold leading-8 tracking-[-0.01em] text-[#1C1A17] sm:text-[30px] sm:leading-9">
            Explore how Earth&apos;s surface may have moved.
          </h1>
          <p className="mt-3 max-w-2xl text-[14px] leading-6 text-[#4A443C]">
            MOTUS examines radar measurements taken from space to look for changes in Earth&apos;s
            surface. It can compare an observed pattern with earthquake models, but it cannot
            always tell what caused a change — and it will say so when it can&apos;t.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              onClick={scrollToChoose}
              className="h-11 gap-2 rounded-lg bg-[#1C1A17] px-5 text-[13.5px] font-medium text-white hover:bg-[#33302B]"
            >
              <Play className="h-4 w-4" aria-hidden />
              Start an analysis
            </Button>
            <span className="text-[12px] text-[#8A837B]">
              Free to explore — a demonstration dataset is always available.
            </span>
          </div>
          <ol className="mt-7 grid gap-2 text-[12px] text-[#6F6862] sm:grid-cols-3 sm:gap-4" aria-label="How to use MOTUS">
            {[
              ['1', 'Choose an area', 'Pick a study area below. Labels say whether the data are real, a demo, or unavailable.'],
              ['2', 'Analyze it', 'One click runs the full analysis. Advanced settings stay out of the way until you want them.'],
              ['3', 'Understand the result', 'What was found, how certain it is, what could explain it, and what it does not prove.'],
            ].map(([n, title, desc]) => (
              <li key={n} className="flex gap-2.5 rounded-xl border border-[#EFEAE2] bg-white p-3.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1C1A17] font-mono text-[10px] font-semibold text-white" aria-hidden>
                  {n}
                </span>
                <span>
                  <span className="block text-[12.5px] font-semibold text-[#1C1A17]">{title}</span>
                  <span className="mt-0.5 block leading-4 text-[#8A837B]">{desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        {/* ---------- Step 1 · Choose an area ---------- */}
        <section id="choose-area" aria-label="Step 1 — choose an area" className="mb-8 scroll-mt-20">
          <StepHeader
            n={1}
            title="Choose an area"
            note="Each card explains what the data are and whether you can run an analysis right now."
          />
          {datasets === null ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[150px] animate-pulse rounded-xl border border-[#EFEAE2] bg-white" />
              ))}
            </div>
          ) : datasets.length === 0 ? (
            <div className="rounded-xl border border-[#E7D9B8] bg-[#FCF8EE] p-5 text-[13px] leading-5 text-[#7A6438]" role="alert">
              The dataset list could not be loaded. Please reload the page and try again.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sortedDatasets!.map((d) => {
                const ready = readinessOf(d);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setSelectedId(d.id)}
                    aria-pressed={d.id === selectedId}
                    className={`h-fit rounded-xl border bg-white p-4 text-left transition-all duration-150 ${
                      d.id === selectedId
                        ? 'border-[1.5px] border-[#1C1A17] shadow-[0_1px_8px_rgba(28,26,23,0.08)]'
                        : 'border-[#E7E2DA] hover:border-[#B8AFA2]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <ReadinessBadge d={d} />
                    </div>
                    <div className="mt-2 line-clamp-2 min-h-[2.5em] text-[13px] font-medium leading-[1.25em] text-[#1C1A17]">
                      {d.title}
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11.5px] leading-4 text-[#8A837B]">{ready.detail}</p>
                    <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.04em] text-[#8A837B]">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                      {d.temporalBaselineDays > 0
                        ? `${d.temporalBaselineDays}-day pair · ${fmtDate(d.referenceTime)} → ${fmtDate(d.secondaryTime)}`
                        : 'time range shown after download'}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ---------- Workspace: Step 2 (run) · map · Step 3 (result) ---------- */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          {/* Step 2 — Run the analysis (first on mobile, right column on desktop) */}
          <section aria-label="Step 2 — run the analysis" className="order-1 self-start rounded-xl border border-[#E7E2DA] bg-white p-5 lg:order-2 lg:col-start-2 lg:row-start-1">
            <StepHeader n={2} title="Run the analysis" note="One click. The default settings are safe; technical options are hidden below." inside />
            {detail ? (
              <>
                <div className="mt-4 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <DataClassBadge dataClass={detail.provenance.dataClass} mode={detail.mode} />
                  </div>
                  <h2 className="mt-2 text-[14.5px] font-semibold leading-5 text-[#1C1A17]">{detail.title}</h2>
                  <p className="mt-1 text-[12.5px] leading-[1.4rem] text-[#6F6862]">{detail.blurb}</p>
                </div>

                {detail.availability.state !== 'available' && (
                  <div className="mt-3 rounded-lg border border-[#E5C4B7] bg-[#FBF3EF] p-3.5" role="alert">
                    <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#9E3B2C]">
                      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                      {selectedReadiness?.label} — analysis cannot run yet
                    </p>
                    <p className="mt-1.5 text-[12px] leading-[1.4rem] text-[#9E3B2C]">
                      {detail.availability.explanation}
                    </p>
                    {anyReady && (
                      <p className="mt-2 text-[12px] leading-[1.4rem] text-[#9E3B2C]">
                        Tip: choose a <strong>Ready to analyze</strong> or <strong>Demo data</strong> area above — those work right now.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  onClick={runAnalysis}
                  disabled={running || detail.availability.state !== 'available'}
                  className="mt-4 h-11 w-full gap-2 rounded-lg bg-[#1C1A17] text-[13.5px] font-medium text-white hover:bg-[#33302B] disabled:opacity-60"
                >
                  {running ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Analyzing… {elapsed}s
                    </>
                  ) : detail.availability.state !== 'available' ? (
                    <>
                      <AlertTriangle className="h-4 w-4" aria-hidden />
                      Data unavailable — choose another area
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4" aria-hidden />
                      Analyze this area
                    </>
                  )}
                </Button>
                {detail.availability.state === 'available' && (
                  <p className="mt-2 text-center text-[11px] leading-4 text-[#8A837B]">
                    {detail.mode === 'evidence'
                      ? 'Assembles the real catalog records, official imagery and the model prediction.'
                      : detail.provenance.dataClass === 'real'
                        ? 'Typically a few seconds; cross-checking earthquake records can take up to ~20 s.'
                        : 'Typically a few seconds on demonstration data.'}
                  </p>
                )}

                {running && (
                  <div className="mt-4 rounded-lg border border-[#EFEAE2] bg-[#FDFCF9] p-3.5" aria-live="polite">
                    <p className="flex items-center gap-2 text-[12.5px] font-medium text-[#1C1A17]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B08D57]" aria-hidden />
                      Running the analysis
                    </p>
                    <p className="mt-1 text-[11px] leading-4 text-[#8A837B]">
                      The server runs all of the steps below in one pass — they complete together when the
                      result returns.
                    </p>
                    <ul className="mt-2.5 space-y-2">
                      {stages.map((s) => (
                        <li key={s.label} className="flex gap-2.5">
                          <span className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[#B08D57]" aria-hidden />
                          <span>
                            <span className="block text-[12px] font-medium leading-4 text-[#4A443C]">{s.label}</span>
                            <span className="mt-0.5 block text-[11px] leading-4 text-[#8A837B]">{s.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <Collapsible className="mt-4 border-t border-[#EFEAE2] pt-3">
                  <CollapsibleTrigger className="group flex w-full items-center justify-between text-[12px] text-[#6F6862] hover:text-[#1C1A17]">
                    <span>Advanced settings</span>
                    <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-3.5">
                    <p className="text-[11px] leading-4 text-[#8A837B]">
                      These control how strictly the analysis flags changes. The defaults are sensible;
                      change them only if you know why.
                    </p>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <MicroLabel>
                          Signal-quality threshold
                          <span className="ml-1.5 font-mono text-[9px] normal-case tracking-normal" title="Technical name: coherence threshold">(coherence)</span>
                        </MicroLabel>
                        <span className="font-mono text-[11px] tabular-nums text-[#4A443C]">{advanced.coherenceThreshold.toFixed(2)}</span>
                      </div>
                      <Slider
                        value={[advanced.coherenceThreshold]}
                        min={0.05}
                        max={0.9}
                        step={0.05}
                        onValueChange={(v) => setAdvanced((a) => ({ ...a, coherenceThreshold: v[0] }))}
                        aria-label="Coherence threshold"
                      />
                      <p className="mt-1.5 text-[10.5px] leading-3.5 text-[#8A837B]">
                        Pixels with a signal-quality (coherence) score below this are excluded as too unreliable to measure.
                      </p>
                      {(() => {
                        const sugg = selectedEntry?.suggestedParams?.coherenceThreshold;
                        if (sugg === undefined || Math.abs(sugg - advanced.coherenceThreshold) < 1e-9) return null;
                        return (
                          <p className="mt-1.5 text-[10.5px] leading-3 text-[#8A837B]">
                            Suggested starting value for this scene: {sugg.toFixed(2)} — the dataset notes explain why.
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <MicroLabel>
                        Minimum change to flag
                        <span className="ml-1.5 font-mono text-[9px] normal-case tracking-normal" title="Technical name: detection floor">(detection floor)</span>
                      </MicroLabel>
                      <Select
                        value={String(advanced.detectionFloor)}
                        onValueChange={(v) => setAdvanced((a) => ({ ...a, detectionFloor: Number(v) }))}
                      >
                        <SelectTrigger className="h-8 w-32 rounded-md border-[#D8D2C6] text-[12px]" aria-label="Detection floor">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['0.005', '0.01', '0.02', '0.05'].map((v) => (
                            <SelectItem key={v} value={v}>{(Number(v) * 1000).toFixed(0)} mm</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <MicroLabel>
                        Strictness
                        <span className="ml-1.5 font-mono text-[9px] normal-case tracking-normal" title="Technical name: significance k·σ">(k·σ)</span>
                      </MicroLabel>
                      <Select
                        value={String(advanced.significanceK)}
                        onValueChange={(v) => setAdvanced((a) => ({ ...a, significanceK: Number(v) }))}
                      >
                        <SelectTrigger className="h-8 w-20 rounded-md border-[#D8D2C6] text-[12px]" aria-label="Significance k">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['2', '3', '4'].map((v) => (
                            <SelectItem key={v} value={v}>{v}σ {v === '3' ? '(default)' : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <MicroLabel>
                        Zero point
                        <span className="ml-1.5 font-mono text-[9px] normal-case tracking-normal" title="Technical name: reference region strategy">(reference)</span>
                      </MicroLabel>
                      <Select
                        value={advanced.referenceStrategy}
                        onValueChange={(v) => setAdvanced((a) => ({ ...a, referenceStrategy: v as AdvancedParams['referenceStrategy'] }))}
                      >
                        <SelectTrigger className="h-8 w-44 rounded-md border-[#D8D2C6] text-[12px]" aria-label="Reference region">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="farField">quiet frame edge (default)</SelectItem>
                          <SelectItem value="fullFrameMedian">whole-frame median</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <MicroLabel>Remove tilted background</MicroLabel>
                        <p className="mt-0.5 text-[10.5px] leading-3 text-[#8A837B]">can also remove real motion — off by default</p>
                      </div>
                      <Switch
                        checked={advanced.detrend}
                        onCheckedChange={(c) => setAdvanced((a) => ({ ...a, detrend: c }))}
                        aria-label="Planar detrend"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAdvanced({
                        ...DEFAULT_ADVANCED,
                        coherenceThreshold:
                          selectedEntry?.suggestedParams?.coherenceThreshold ?? DEFAULT_ADVANCED.coherenceThreshold,
                      })}
                      className="h-7 gap-1.5 px-2 text-[11px] font-normal text-[#8A837B] hover:text-[#1C1A17]"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden /> Reset to defaults
                    </Button>
                  </CollapsibleContent>
                </Collapsible>

                <DatasetDetailsCollapsible detail={detail} />
              </>
            ) : (
              <div className="mt-4 space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
          </section>

          {/* Map: second on mobile, left column spanning both rows on desktop */}
          <section aria-label="Study area map" className="order-2 lg:order-1 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            {detail ? (
              <div className="lg:sticky lg:top-20">
                <MapPanel
                  key={detail.id}
                  dataset={detail}
                  grids={grids}
                  gridsMeta={gridsMeta}
                  layer={layer}
                  opacity={opacity}
                  events={eventsForMap as never}
                  primaryEvent={primaryEvent as never}
                  granulePolys={granulePolys}
                />
                {grids && detail && (
                  <div className="mt-3 rounded-xl border border-[#E7E2DA] bg-white px-3.5 py-3">
                    <div role="tablist" aria-label="Map layer" className="flex flex-wrap overflow-hidden rounded-md border border-[#E7E2DA]">
                      {(['displacement', 'coherence', 'sigma', 'coverage'] as LayerKind[]).map((l) => (
                        <button
                          key={l}
                          role="tab"
                          aria-selected={layer === l}
                          onClick={() => setLayer(l)}
                          className={`flex-1 px-3 py-1.5 text-[11.5px] transition-colors ${
                            layer === l ? 'bg-[#1C1A17] text-white' : 'bg-white text-[#6F6862] hover:bg-[#F7F4EE]'
                          }`}
                        >
                          {layerLabel(l, isPredictionLayer)}
                        </button>
                      ))}
                    </div>
                    {layer === 'displacement' && (
                      <label className="mt-2.5 flex items-center gap-2 text-[11px] text-[#8A837B]">
                        Layer opacity
                        <Slider
                          value={[Math.round(opacity * 100)]}
                          min={40}
                          max={100}
                          step={5}
                          onValueChange={(v) => setOpacity(v[0] / 100)}
                          className="w-24"
                          aria-label="Layer opacity"
                        />
                        <span className="w-8 font-mono tabular-nums text-[#4A443C]">{Math.round(opacity * 100)}%</span>
                      </label>
                    )}
                    <p className="mt-2.5 text-[11.5px] leading-4 text-[#6F6862]">
                      {layerInterpretation(layer, isPredictionLayer)}
                    </p>
                    {isPredictionLayer && (
                      <p className="mt-1.5 text-[10.5px] font-medium uppercase tracking-[0.06em] text-[#8F4A2B]">
                        Model prediction — not a measurement
                      </p>
                    )}
                  </div>
                )}
                {!grids && (
                  <p className="mt-3 rounded-xl border border-[#E7E2DA] bg-white px-3.5 py-3 text-[11.5px] leading-4 text-[#6F6862]">
                    This is the selected study area. After you run the analysis, the measurements appear
                    here as colors on the map.
                  </p>
                )}
              </div>
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[#E7E2DA] bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-[#B8AFA2]" aria-label="Loading" />
              </div>
            )}
          </section>

          {/* Step 3 — Understand the result (below step 2 on mobile, right column on desktop) */}
          <section aria-label="Step 3 — understand the result" className="order-3 lg:order-2 lg:col-start-2 lg:row-start-2">
            {error && (
              <div className="rounded-xl border border-[#E7E2DA] bg-white p-5">
                <Alert variant="destructive" className="rounded-lg border-[#E5C4B7] bg-[#FBF3EF] text-[#9E3B2C]">
                  <AlertTitle>The analysis could not be completed</AlertTitle>
                  <AlertDescription className="text-[12px] leading-[1.4rem] text-[#9E3B2C]">{error}</AlertDescription>
                </Alert>
              </div>
            )}
            {result && detail && (
              <div className="rounded-xl border border-[#E7E2DA] bg-white p-5">
                <StepHeader n={3} title="Understand the result" note="Read this top to bottom: the finding, the certainty, possible explanations, and the limits." inside />
                <div className="mt-4">
                  {isEvidenceResult(result) ? (
                    <EvidenceResults result={result} onGranulePolys={setGranulePolys} />
                  ) : (
                    <QuantitativeResults result={result} />
                  )}
                </div>
              </div>
            )}
            {!result && !error && !running && detail && (
              <div className="rounded-xl border border-dashed border-[#D8D2C6] bg-white/60 p-6 text-center">
                <p className="text-[13px] font-medium text-[#4A443C]">No result yet</p>
                <p className="mx-auto mt-1.5 max-w-xs text-[12px] leading-[1.45rem] text-[#8A837B]">
                  Run the analysis above (step 2). When it finishes, the result appears here —
                  what was found, how certain it is, and what could explain it.
                </p>
              </div>
            )}
          </section>
        </div>

        {/* ---------- Honest scope note ---------- */}
        <section aria-label="About the results" className="mt-10 rounded-xl border border-[#E7E2DA] bg-white p-5">
          <h2 className="text-[14px] font-semibold text-[#1C1A17]">What MOTUS can and cannot tell you</h2>
          <ul className="mt-2.5 grid gap-2 text-[12.5px] leading-[1.45rem] text-[#6F6862] sm:grid-cols-2">
            <li className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2C5F58]" aria-hidden />
              <span>It measures <em>apparent</em> movement toward or away from the satellite — one viewing direction, not a full 3-D motion.</span>
            </li>
            <li className="flex gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2C5F58]" aria-hidden />
              <span>It compares each pattern with earthquake records and models — a consistency check, not proof of cause.</span>
            </li>
            <li className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 shrink-0 text-[#B08D57]" aria-hidden />
              <span>It cannot always separate real ground motion from atmospheric effects in the radar signal.</span>
            </li>
            <li className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#B08D57]" aria-hidden />
              <span>One measurement pair cannot distinguish slow ongoing processes from one-off events.</span>
            </li>
          </ul>
          <p className="mt-3 text-[12px] text-[#8A837B]">
            Radar terminology is explained where it appears — look for{' '}
            <WhatIsThis label="&ldquo;What does this mean?&rdquo;">These expandable notes define technical terms such as coherence (how consistently the radar signal matches between observations), interferogram (a map made by comparing two radar observations), and LOS displacement (movement toward or away from the satellite&apos;s viewing direction).</WhatIsThis>
          </p>
        </section>
      </main>

      <footer className="mt-auto border-t border-[#E7E2DA] bg-white">
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
          <p className="text-[11px] leading-4 text-[#8A837B]">
            Data: NASA CMR · ASF DAAC · USGS ComCat · NISAR sample products (ALOS PALSAR via the NISAR SDS).
            MOTUS is a scientific demonstration for the NASA Space Apps Challenge 2026 — not an operational service.
            Demonstration datasets are clearly labelled and are not observations of the Earth.
            {health && !health.capabilities.liveUsgs && ' (Live earthquake catalog currently unreachable — cached records are used.)'}
          </p>
        </div>
      </footer>
    </div>
  );
}

/** Numbered step heading used across the page. */
function StepHeader({ n, title, note, inside }: { n: 1 | 2 | 3; title: string; note?: string; inside?: boolean }) {
  return (
    <div className={inside ? '' : 'mb-4'}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1C1A17] font-mono text-[11px] font-semibold text-white" aria-hidden>
          {n}
        </span>
        <h2 className="text-[16px] font-semibold tracking-[-0.005em] text-[#1C1A17]">{title}</h2>
      </div>
      {note && <p className="mt-1 pl-[34px] text-[12px] leading-[1.45rem] text-[#8A837B]">{note}</p>}
    </div>
  );
}

/** "About this data" — technical provenance behind a collapsible, off the default path. */
function DatasetDetailsCollapsible({ detail }: { detail: DatasetDetail }) {
  const [open, setOpen] = useState(false);
  const p = detail.provenance;
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4 border-t border-[#EFEAE2] pt-3">
      <CollapsibleTrigger className="group flex w-full items-center justify-between text-[12px] text-[#6F6862] hover:text-[#1C1A17]">
        <span>About this data</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <Fact label="Sensor" value={p.platform} />
          <Fact label="Product" value={p.productType} />
          {p.referenceTime && <Fact label="Earlier image" value={fmtDateTime(p.referenceTime)} mono />}
          {p.secondaryTime && <Fact label="Later image" value={fmtDateTime(p.secondaryTime)} mono />}
          {detail.geometry && (
            <>
              <Fact label="Radar wavelength" value={`${(detail.geometry.wavelength * 100).toFixed(1)} cm (L band)`} mono />
              <Fact label="Viewing angle" value={`${detail.geometry.incidenceAngleDeg.toFixed(1)}° from vertical`} mono />
              <Fact label="Orbit / view" value={`${detail.geometry.passDirection} pass · ${detail.geometry.lookDirection}-looking`} />
            </>
          )}
          {detail.numberOfLooks !== undefined && (
            <Fact label="Averaged samples (looks)" value={String(detail.numberOfLooks)} mono />
          )}
        </div>
        {p.doi && (
          <a
            href={`https://doi.org/${p.doi}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block font-mono text-[10.5px] text-[#6F6862] underline decoration-[#D8D2C6] underline-offset-2 hover:text-[#1C1A17]"
          >
            DOI {p.doi}
          </a>
        )}
        {p.accessNotes && (
          <div className="mb-3 mt-3 flex items-start gap-2 rounded-md border border-[#E7D9B8] bg-[#FCF8EE] px-2.5 py-2 text-[11px] leading-4 text-[#7A6438]">
            <span>{p.accessNotes}</span>
          </div>
        )}
        <dl className="space-y-2 text-[11px] leading-4">
          <ProvenRow k="Provider" v={p.provider} />
          <ProvenRow k="Product ID" v={p.productId} mono />
          <ProvenRow k="Processing" v={p.processingSoftware ?? '—'} />
          <ProvenRow k="Processed at" v={p.processingTime ? fmtDateTime(p.processingTime) : '—'} />
          <ProvenRow k="Source" v={p.sourceUrl} link />
          {p.qualityNotes && (
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A837B]">Quality flags</dt>
              <dd>
                <ul className="mt-1 list-inside list-disc space-y-0.5 text-[#6F6862]">
                  {p.qualityNotes.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {detail.availability.state !== 'available' &&
            (detail.availability.missingFiles.length > 0 || detail.availability.invalidFiles.length > 0) && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-[0.06em] text-[#8A837B]">Missing / failed files</dt>
                <dd className="mt-1 font-mono text-[10px] leading-4 text-[#9E3B2C]/80">
                  {[...detail.availability.missingFiles,
                    ...detail.availability.invalidFiles.map((f) => `${f.file} (${f.reason})`)].join(' · ')}
                </dd>
              </div>
            )}
        </dl>
      </CollapsibleContent>
    </Collapsible>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <MicroLabel>{label}</MicroLabel>
      <div className={`mt-0.5 truncate text-[12px] leading-4 text-[#1C1A17] ${mono ? 'font-mono tabular-nums' : ''}`} title={value}>
        {value}
      </div>
    </div>
  );
}

function ProvenRow({ k, v, mono, link }: { k: string; v: string; mono?: boolean; link?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-[10px] font-medium uppercase leading-4 tracking-[0.06em] text-[#8A837B]">{k}</dt>
      <dd className={`min-w-0 break-words text-[#4A443C] ${mono ? 'font-mono text-[10px]' : ''}`}>
        {link ? (
          <a href={v} target="_blank" rel="noopener noreferrer" className="underline decoration-[#D8D2C6] underline-offset-2 hover:text-[#1C1A17]">
            {v.length > 60 ? v.slice(0, 57) + '…' : v}
          </a>
        ) : (
          v
        )}
      </dd>
    </div>
  );
}
