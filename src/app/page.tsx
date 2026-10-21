'use client';

/**
 * MOTUS — Earth-change intelligence (NASA Space Apps 2026, "Dancing with the SARs").
 *
 * Single-page application: dataset selection -> map workspace -> analysis
 * results with honest uncertainty and traceable evidence.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, Play, RotateCcw, ChevronDown, ChevronRight, Lock, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { MethodologyDrawer } from '@/components/app/methodology';
import { QuantitativeResults } from '@/components/app/results-panel';
import { EvidenceViewer } from '@/components/app/evidence-viewer';
import {
  DataClassBadge,
  MicroLabel,
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
      <Skeleton className="h-full w-full rounded-xl" />
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
          setSelectedId(d.datasets[0]?.id ?? null);
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

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF9F6]">
      <header className="sticky top-0 z-40 border-b border-[#E7E2DA] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[1240px] items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-baseline gap-3">
            <span className="text-[17px] font-semibold tracking-[0.02em] text-[#1C1A17]">MOTUS</span>
            <span className="hidden text-[11px] text-[#8A837B] sm:inline">
              Earth-change intelligence · NASA Space Apps 2026
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <StatusPill ok={health?.capabilities.liveCmr} label="CMR" />
            <StatusPill ok={health?.capabilities.liveUsgs} label="USGS" />
            <StatusPill ok={(datasets?.length ?? 0) > 0} label={`${datasets?.length ?? 0} datasets`} />
            <MethodologyDrawer
              trigger={
                <Button variant="outline" size="sm" className="ml-1 hidden h-7 gap-1.5 rounded-full border-[#D8D2C6] px-3 text-[11px] font-normal text-[#4A443C] hover:bg-[#F7F4EE] sm:inline-flex">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  How it works
                </Button>
              }
            />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6">
        <section aria-label="Introduction" className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-[13px] leading-5 text-[#6F6862]">
            Measure how the Earth&apos;s surface moved between two radar acquisitions — with honest uncertainty,
            traceable evidence and clearly labelled explanations.
          </p>
          <div className="sm:hidden">
            <MethodologyDrawer
              trigger={
                <Button variant="outline" size="sm" className="h-7 gap-1.5 rounded-full border-[#D8D2C6] px-3 text-[11px] font-normal text-[#4A443C]">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden /> How it works
                </Button>
              }
            />
          </div>
        </section>

        <section aria-label="Dataset selection" className="mb-6">
          <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
            {(datasets ?? Array.from({ length: 5 }, (_, i) => null)).map((d, i) =>
              d === null ? (
                <div key={i} className="h-[104px] w-64 shrink-0 animate-pulse rounded-xl border border-[#EFEAE2] bg-white" />
              ) : (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setSelectedId(d.id)}
                  aria-pressed={d.id === selectedId}
                  className={`h-fit w-64 shrink-0 rounded-xl border bg-white p-3.5 text-left transition-all duration-150 ${
                    d.id === selectedId
                      ? 'border-[1.5px] border-[#1C1A17]'
                      : 'border-[#E7E2DA] hover:border-[#B8AFA2]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <DataClassBadge dataClass={d.dataClass} mode={d.mode} />
                    {d.availability.state !== 'available' && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border border-[#E5C4B7] bg-[#FBF3EF] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.05em] text-[#9E3B2C]"
                        title={d.availability.explanation}
                      >
                        {d.availability.state === 'missing'
                          ? 'data not downloaded'
                          : d.availability.state === 'incomplete'
                            ? 'incomplete data'
                            : 'invalid data'}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 line-clamp-2 min-h-[2.4em] text-[12.5px] font-medium leading-[1.2em] text-[#1C1A17]">
                    {d.title}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.04em] text-[#8A837B]">
                    {d.temporalBaselineDays > 0
                      ? `${d.temporalBaselineDays}-day pair · ${fmtDate(d.referenceTime)} → ${fmtDate(d.secondaryTime)}`
                      : 'local data required before analysis'}
                  </div>
                </button>
              ),
            )}
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.85fr_1fr]">
          <div>
            {detail ? (
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
            ) : (
              <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[#E7E2DA] bg-white">
                <Loader2 className="h-5 w-5 animate-spin text-[#B8AFA2]" aria-label="Loading" />
              </div>
            )}
            {grids && detail && (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#E7E2DA] bg-white px-3.5 py-2.5">
                <div role="tablist" aria-label="Map layer" className="flex overflow-hidden rounded-md border border-[#E7E2DA]">
                  {(['displacement', 'coherence', 'sigma', 'coverage'] as LayerKind[]).map((l) => (
                    <button
                      key={l}
                      role="tab"
                      aria-selected={layer === l}
                      onClick={() => setLayer(l)}
                      className={`px-3 py-1.5 text-[11.5px] transition-colors ${
                        layer === l ? 'bg-[#1C1A17] text-white' : 'bg-white text-[#6F6862] hover:bg-[#F7F4EE]'
                      }`}
                    >
                      {l === 'displacement' ? (isEvidenceResult(result ?? {} as never) && (result as { kind?: string })?.kind === 'evidence' ? 'Model prediction' : 'Displacement') : l === 'coherence' ? 'Coherence' : l === 'sigma' ? 'Uncertainty' : 'Coverage'}
                    </button>
                  ))}
                </div>
                {layer === 'displacement' && (
                  <label className="flex items-center gap-2 text-[11px] text-[#8A837B]">
                    opacity
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
                {(result && isEvidenceResult(result) && result.prediction) && (
                  <span className="text-[10.5px] uppercase tracking-[0.06em] text-[#8F4A2B]">model · not a measurement</span>
                )}
              </div>
            )}
          </div>

          <div className="space-y-5">
            {detail ? (
              <>
                <section aria-label="Dataset details" className="rounded-xl border border-[#E7E2DA] bg-white p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <DataClassBadge dataClass={detail.provenance.dataClass} mode={detail.mode} />
                    {detail.isSynthetic && (
                      <span className="text-[10px] uppercase tracking-[0.06em] text-[#8F4A2B]">validation lab</span>
                    )}
                  </div>
                  <h1 className="mt-2 text-[15px] font-semibold leading-5 text-[#1C1A17]">{detail.title}</h1>
                  <p className="mt-1.5 text-[12.5px] leading-5 text-[#6F6862]">{detail.blurb}</p>
                  {detail.availability.state !== 'available' && (
                    <div className="mt-3 rounded-lg border border-[#E5C4B7] bg-[#FBF3EF] p-3" role="alert">
                      <p className="text-[11.5px] font-medium text-[#9E3B2C]">
                        Local data {detail.availability.state} — analysis not possible yet
                      </p>
                      <p className="mt-1 text-[11.5px] leading-4 text-[#9E3B2C]">{detail.availability.explanation}</p>
                      {(detail.availability.missingFiles.length > 0 || detail.availability.invalidFiles.length > 0) && (
                        <p className="mt-1.5 font-mono text-[10px] leading-4 text-[#9E3B2C]/80">
                          {[...detail.availability.missingFiles,
                            ...detail.availability.invalidFiles.map((f) => `${f.file} (${f.reason})`)].join(' · ')}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
                    <Fact label="Sensor" value={detail.provenance.platform} />
                    <Fact label="Product" value={detail.provenance.productType} />
                    {detail.provenance.referenceTime && (
                      <Fact label="Reference scene" value={fmtDateTime(detail.provenance.referenceTime)} mono />
                    )}
                    {detail.provenance.secondaryTime && (
                      <Fact label="Secondary scene" value={fmtDateTime(detail.provenance.secondaryTime)} mono />
                    )}
                    {detail.geometry && (
                      <>
                        <Fact label="Wavelength" value={`${(detail.geometry.wavelength * 100).toFixed(1)} cm (L band)`} mono />
                        <Fact label="Incidence" value={`${detail.geometry.incidenceAngleDeg.toFixed(1)}°`} mono />
                        <Fact label="Pass / look" value={`${detail.geometry.passDirection} · ${detail.geometry.lookDirection}-looking`} />
                      </>
                    )}
                    {detail.numberOfLooks !== undefined && (
                      <Fact label="Looks" value={String(detail.numberOfLooks)} mono />
                    )}
                  </div>
                  {detail.provenance.doi && (
                    <a
                      href={`https://doi.org/${detail.provenance.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-block font-mono text-[10.5px] text-[#6F6862] underline decoration-[#D8D2C6] underline-offset-2 hover:text-[#1C1A17]"
                    >
                      DOI {detail.provenance.doi}
                    </a>
                  )}
                  <ProvenanceBlock detail={detail} />
                </section>

                <section aria-label="Analysis" className="rounded-xl border border-[#E7E2DA] bg-white p-5">
                  <Button
                    onClick={runAnalysis}
                    disabled={running || detail.availability.state !== 'available'}
                    className="h-10 w-full gap-2 rounded-lg bg-[#1C1A17] text-[13px] font-medium text-white hover:bg-[#33302B] disabled:opacity-60"
                  >
                    {running ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Processing… {elapsed}s
                      </>
                    ) : detail.availability.state !== 'available' ? (
                      <>
                        <Lock className="h-4 w-4" aria-hidden />
                        Local data {detail.availability.state} — see instructions above
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" aria-hidden />
                        {detail.mode === 'evidence' ? 'Assemble evidence & model' : 'Run analysis'}
                      </>
                    )}
                  </Button>
                  {running && detail.provenance.dataClass === 'real' && (
                    <p className="mt-2 text-center text-[11px] leading-4 text-[#8A837B]">
                      Cross-matching independent USGS seismic evidence — the catalog can take ~20 s to answer.
                    </p>
                  )}
                  {running && (
                    <div className="mt-3 space-y-2">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-24 w-full" />
                    </div>
                  )}

                  <Collapsible className="mt-3">
                    <CollapsibleTrigger className="group flex w-full items-center justify-between text-[12px] text-[#6F6862] hover:text-[#1C1A17]">
                      <span>Advanced parameters</span>
                      <ChevronDown className="h-3.5 w-3.5 transition-transform duration-150 group-data-[state=open]:rotate-180" aria-hidden />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 pt-3.5">
                      <div>
                        <div className="mb-1.5 flex items-center justify-between">
                          <MicroLabel>Coherence threshold</MicroLabel>
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
                        <MicroLabel>Detection floor</MicroLabel>
                        <Select
                          value={String(advanced.detectionFloor)}
                          onValueChange={(v) => setAdvanced((a) => ({ ...a, detectionFloor: Number(v) }))}
                        >
                          <SelectTrigger className="h-8 w-32 rounded-md border-[#D8D2C6] text-[12px]">
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
                        <MicroLabel>Significance (k·σ)</MicroLabel>
                        <Select
                          value={String(advanced.significanceK)}
                          onValueChange={(v) => setAdvanced((a) => ({ ...a, significanceK: Number(v) }))}
                        >
                          <SelectTrigger className="h-8 w-20 rounded-md border-[#D8D2C6] text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {['2', '3', '4'].map((v) => (
                              <SelectItem key={v} value={v}>{v}σ</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <MicroLabel>Reference region</MicroLabel>
                        <Select
                          value={advanced.referenceStrategy}
                          onValueChange={(v) => setAdvanced((a) => ({ ...a, referenceStrategy: v as AdvancedParams['referenceStrategy'] }))}
                        >
                          <SelectTrigger className="h-8 w-44 rounded-md border-[#D8D2C6] text-[12px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="farField">frame margin (far field)</SelectItem>
                            <SelectItem value="fullFrameMedian">full-frame median</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <MicroLabel>Planar detrend</MicroLabel>
                          <p className="mt-0.5 text-[10.5px] leading-3 text-[#8A837B]">can absorb real deformation</p>
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
                </section>

                {error && (
                  <Alert variant="destructive" className="rounded-xl border-[#E5C4B7] bg-[#FBF3EF] text-[#9E3B2C]">
                    <AlertTitle>Analysis failed</AlertTitle>
                    <AlertDescription className="text-[12px] leading-4 text-[#9E3B2C]">{error}</AlertDescription>
                  </Alert>
                )}

                {result && (
                  <section aria-label="Results" className="rounded-xl border border-[#E7E2DA] bg-white p-5">
                    {isEvidenceResult(result) ? (
                      <>
                        <h2 className="mb-4 text-[15px] font-semibold text-[#1C1A17]">Evidence</h2>
                        <p className="mb-5 text-[13px] leading-5 text-[#4A443C]">{result.narrative.whatChanged}</p>
                        <EvidenceViewer result={result} onGranulePolys={setGranulePolys} />
                      </>
                    ) : (
                      <QuantitativeResults result={result} />
                    )}
                  </section>
                )}
              </>
            ) : (
              <div className="space-y-5">
                <Skeleton className="h-64 w-full rounded-xl" />
                <Skeleton className="h-40 w-full rounded-xl" />
              </div>
            )}
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-[#E7E2DA] bg-white">
        <div className="mx-auto max-w-[1240px] px-4 py-5 sm:px-6">
          <p className="text-[11px] leading-4 text-[#8A837B]">
            Data: NASA CMR · ASF DAAC · USGS ComCat · NISAR sample products (ALOS PALSAR via the NISAR SDS).
            MOTUS is a scientific demonstration for the NASA Space Apps Challenge 2026 — not an operational service.
            Synthetic validation fixtures are clearly labelled and are not Earth observations.
          </p>
        </div>
      </footer>
    </div>
  );
}

function StatusPill({ ok, label }: { ok: boolean | undefined; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E7E2DA] px-2.5 py-1 text-[10.5px] text-[#6F6862]">
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-[#4C7A5A]' : 'bg-[#B8AFA2]'}`}
        aria-hidden
      />
      {label}
    </span>
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

function ProvenanceBlock({ detail }: { detail: DatasetDetail }) {
  const [open, setOpen] = useState(false);
  const p = detail.provenance;
  return (
    <div className="mt-3.5 border-t border-[#EFEAE2] pt-3">
      {p.accessNotes && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-[#E7D9B8] bg-[#FCF8EE] px-2.5 py-2 text-[11px] leading-4 text-[#7A6438]">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{p.accessNotes}</span>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[11.5px] text-[#6F6862] hover:text-[#1C1A17]"
      >
        <ChevronRight className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-90' : ''}`} aria-hidden />
        Full provenance &amp; processing record
      </button>
      {open && (
        <dl className="mt-2.5 space-y-2 text-[11px] leading-4">
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
        </dl>
      )}
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
