/**
 * Client-side types mirroring the API contract.
 * Heavy science types are imported from @/lib/science/types where needed.
 */

import type {
  AnalysisResult,
  ProvenanceRecord,
  RadarGeometry,
  TransportGrid,
  UsgsEventLite,
} from '@/lib/science/types';

export interface DatasetListEntry {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  mode: 'quantitative' | 'evidence';
  dataClass: 'real' | 'synthetic' | 'derived';
  isSynthetic: boolean;
  sensor: string;
  referenceTime: string;
  secondaryTime: string;
  temporalBaselineDays: number;
  center?: { lat: number; lon: number };
  /** Scene-adapted starting parameters suggested by the dataset registry. */
  suggestedParams?: {
    coherenceThreshold?: number;
    detectionFloor?: number;
    significanceK?: number;
  };
}

export interface PanamaGranule {
  granuleId: string;
  timeStart: string;
  timeEnd: string;
  polygon: string;
  sizeMB: number;
  dataUrl?: string;
  browseUrl?: string;
  conceptId: string;
  localBrowseUrl: string;
  bracketsEvent?: boolean;
}

export interface DatasetDetail {
  id: string;
  slug: string;
  title: string;
  blurb: string;
  mode: 'quantitative' | 'evidence';
  isSynthetic: boolean;
  provenance: ProvenanceRecord;
  geometry: RadarGeometry;
  footprintPolygon: [number, number][];
  center?: { lat: number; lon: number };
  grid?: { width: number; height: number; epsg: number };
  numberOfLooks: number;
}

export interface EvidenceAnalysisResult {
  kind: 'evidence';
  datasetId: string;
  event: UsgsEventLite | null;
  granules: PanamaGranule[];
  liveEvents: UsgsEventLite[];
  liveStatus: string;
  prediction?: TransportGrid;
  narrative: { whatChanged: string; howMuch: string; reliability: string };
  warnings: string[];
  processingMs: number;
}

export type AnalysisPayload = AnalysisResult | EvidenceAnalysisResult;

export function isEvidenceResult(r: AnalysisPayload): r is EvidenceAnalysisResult {
  return (r as EvidenceAnalysisResult).kind === 'evidence';
}

export interface HealthPayload {
  ok: boolean;
  service: string;
  version: string;
  time: string;
  capabilities: {
    quantitativePipeline: boolean;
    okadaForwardModel: boolean;
    liveCmr: boolean;
    liveUsgs: boolean;
    nisarH5Ingestion: string;
  };
}

export interface CmrLiveResult {
  ok: boolean;
  hits?: number;
  count?: number;
  granules?: PanamaGranule[];
  source?: string;
  queriedAt?: string;
  error?: string;
}
