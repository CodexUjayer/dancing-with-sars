/**
 * Dataset registry — loads analysis-ready datasets from the derived-data
 * directory and exposes them as ScienceDataset objects.
 *
 * Real datasets come from tools/extract_gunw.py output (lossless extraction
 * of official NISAR L2 GUNW sample products). Synthetic fixtures are
 * generated deterministically in-process by src/lib/science/fixtures.ts.
 */

import fs from 'fs';
import path from 'path';
import type { GridMeta, Raster, ScienceDataset } from '@/lib/science/types';
import {
  syntheticStrikeSlipFixture,
  syntheticThrustFixture,
  syntheticNullFixture,
} from '@/lib/science/fixtures';

const DERIVED_ROOT = path.join(process.cwd(), 'data', 'derived');
const BROWSE_ROOT = path.join(process.cwd(), 'data', 'nisar-browse');

interface DerivedMeta {
  slug: string;
  title: string;
  blurb: string;
  grid: GridMeta;
  radar: {
    wavelength: number;
    incidenceAngleDeg: number;
    headingDeg: number;
    passDirection: 'ascending' | 'descending';
    lookDirection: 'right' | 'left';
    losUnitVectorProductX: number;
    losUnitVectorProductY: number;
    numberOfLooks: number;
    ionoScreenSigmaRad: number | null;
  };
  identification: {
    missionId: string;
    granuleId: string;
    frameNumber: number;
    trackNumber: number;
    productDoi: string;
    productSpecificationVersion: string;
    processingDateTime: string;
    referenceZeroDopplerStartTime: string;
    referenceZeroDopplerEndTime: string;
    secondaryZeroDopplerStartTime: string;
    secondaryZeroDopplerEndTime: string;
    temporalBaselineDays: number;
    boundingPolygon: [number, number][];
  };
  processing: {
    softwareVersion: string;
    unwrappingAlgorithm: string;
    flatteningMethod: string;
    wrappedFiltering: string;
    topographicFlatteningApplied: string;
    ellipsoidalFlatteningApplied: string;
    rangeIonosphericCorrectionApplied: string;
    azimuthIonosphericCorrectionApplied: string;
    hydrostaticTroposphericCorrectionApplied: string;
    wetTroposphericCorrectionApplied: string;
    demSource: string;
    l1ReferenceSlcGranules: string[];
    l1SecondarySlcGranules: string[];
    looksAzimuth: number;
    looksRange: number;
  };
  stats: {
    phaseNanFraction: number;
    coherenceMean: number;
    coherenceMedian: number;
  };
}

function readFloat32(file: string): Float32Array {
  const buf = fs.readFileSync(file);
  const out = new Float32Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readFloatLE(i * 4);
  }
  return out;
}

function readUint16(file: string): Uint16Array {
  const buf = fs.readFileSync(file);
  const out = new Uint16Array(buf.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = buf.readUInt16LE(i * 2);
  }
  return out;
}

function loadDerivedDataset(dir: string, sourceUrl: string, accessNotes: string): ScienceDataset {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf-8')) as DerivedMeta;
  const phaseRaster: Raster = { meta: meta.grid, data: readFloat32(path.join(dir, 'phase.f32')) };
  const coherenceRaster: Raster = {
    meta: meta.grid,
    data: readFloat32(path.join(dir, 'coherence.f32')),
  };
  const components = readUint16(path.join(dir, 'components.u16'));

  // Dataset centre from the bounding polygon.
  const poly = meta.identification.boundingPolygon;
  const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
  const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;

  const qualityNotes = [
    `Phase unwrapping: ${meta.processing.unwrappingAlgorithm}`,
    `Flattening: ${meta.processing.flatteningMethod}`,
    `Topographic flattening applied: ${meta.processing.topographicFlatteningApplied}`,
    `Ionospheric correction applied: ${meta.processing.rangeIonosphericCorrectionApplied}`,
    `Tropospheric corrections applied: hydrostatic ${meta.processing.hydrostaticTroposphericCorrectionApplied}, wet ${meta.processing.wetTroposphericCorrectionApplied}`,
    `No-data fraction in stored layers: ${(meta.stats.phaseNanFraction * 100).toFixed(1)}%`,
    `Multilooking: ${meta.processing.looksAzimuth} az x ${meta.processing.looksRange} rg = ${meta.radar.numberOfLooks} looks`,
  ];

  return {
    id: `real-${meta.slug}`,
    slug: meta.slug,
    title: meta.title,
    blurb: meta.blurb,
    mode: 'quantitative',
    provenance: {
      datasetId: `real-${meta.slug}`,
      provider: 'NASA / ASF DAAC (NISAR sample products, processed by JPL NISAR SDS)',
      productId: meta.identification.granuleId,
      productType: 'NISAR L2 GUNW — geocoded unwrapped interferogram (sample product)',
      platform: `${meta.identification.missionId} L-band (NISAR SDS v${meta.processing.softwareVersion})`,
      referenceTime: meta.identification.referenceZeroDopplerStartTime,
      secondaryTime: meta.identification.secondaryZeroDopplerStartTime,
      temporalBaselineDays: meta.identification.temporalBaselineDays,
      processingTime: meta.identification.processingDateTime,
      processingSoftware: `NISAR SDS ${meta.processing.softwareVersion}, spec v${meta.identification.productSpecificationVersion}`,
      dataClass: 'real',
      sourceUrl,
      doi: meta.identification.productDoi,
      accessNotes,
      qualityNotes,
    },
    geometry: {
      wavelength: meta.radar.wavelength,
      incidenceAngleDeg: meta.radar.incidenceAngleDeg,
      headingDeg: meta.radar.headingDeg,
      passDirection: meta.radar.passDirection,
      lookDirection: meta.radar.lookDirection,
    },
    phase: phaseRaster,
    coherence: coherenceRaster,
    components,
    numberOfLooks: meta.radar.numberOfLooks,
    ionoScreenSigmaRad: meta.radar.ionoScreenSigmaRad ?? undefined,
    footprintPolygon: meta.identification.boundingPolygon,
    center: { lat: cy, lon: cx },
  };
}

interface PanamaGranuleRecord {
  granuleId: string;
  timeStart: string;
  timeEnd: string;
  polygon: string;
  sizeMB: number;
  dataUrl?: string;
  browseUrl?: string;
  conceptId: string;
}

function loadPanamaEvidenceDataset(): ScienceDataset {
  const granules = JSON.parse(
    fs.readFileSync(path.join(DERIVED_ROOT, 'panama-2026', 'granules.json'), 'utf-8'),
  ) as PanamaGranuleRecord[];
  const ev = JSON.parse(
    fs.readFileSync(path.join(DERIVED_ROOT, 'panama-2026', 'usgs_event.json'), 'utf-8'),
  ) as {
    id: string; magnitude: number; place: string; time: string; lat: number; lon: number;
    depthKm: number; url: string; nodalPlane: { strike: string; dip: string; rake: string } | null;
    momentTensorSource: string | null;
  };
  const primary = granules[0];

  // Parse the CMR polygon ("lat lon lat lon ...").
  const nums = primary.polygon.trim().split(/\s+/).map(Number);
  const poly: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) poly.push([nums[i + 1], nums[i]]);

  // Local browse images (downloaded from the official ASF cloud, open access).
  const browseFiles = fs
    .readdirSync(BROWSE_ROOT)
    .filter((f) => f.endsWith('_LATLON.png'))
    .map((f) => path.join(BROWSE_ROOT, f));

  const evLite = {
    id: ev.id,
    magnitude: ev.magnitude,
    place: ev.place,
    time: ev.time,
    lat: ev.lat,
    lon: ev.lon,
    depthKm: ev.depthKm,
    url: ev.url,
    nodalPlane: ev.nodalPlane
      ? {
          strike: Number(ev.nodalPlane.strike),
          dip: Number(ev.nodalPlane.dip),
          rake: Number(ev.nodalPlane.rake),
        }
      : undefined,
    momentTensorSource: ev.momentTensorSource ?? undefined,
  };

  const ds: ScienceDataset = {
    id: 'evidence-panama-2026',
    slug: 'panama-2026',
    title: 'Panama M7.7 earthquake — real NISAR evidence (October 2026)',
    blurb:
      'A M7.7 earthquake struck Panama on 9 October 2026, between the acquisitions of real NISAR ' +
      'interferometric pairs. Explore the actual product availability, official browse imagery and an ' +
      'independent forward model of the expected deformation.',
    mode: 'evidence',
    provenance: {
      datasetId: 'evidence-panama-2026',
      provider: 'NASA CMR / ASF DAAC / USGS (all queried live or cached from live queries)',
      productId: primary.granuleId,
      productType: 'NISAR L2 GUNW — granule metadata + official browse imagery',
      platform: 'NISAR L-SAR (L band)',
      referenceTime: primary.timeStart,
      secondaryTime: primary.timeEnd,
      temporalBaselineDays: 12,
      processingTime: undefined,
      processingSoftware: 'NISAR SDS (browse rendering: official product browse)',
      dataClass: 'real',
      sourceUrl: `https://cmr.earthdata.nasa.gov/search/concepts/${primary.conceptId}.json`,
      doi: '10.5067/NIL2GUNW-B1',
      accessNotes:
        'Granule metadata (NASA CMR) and official browse imagery are open. The full HDF5 science ' +
        'product (~1-2 GB) requires a free NASA Earthdata Login to download; this deployment has no ' +
        'credentials, so quantitative processing of this specific pair is not performed here. The ' +
        'identical pipeline is demonstrated on the open NISAR sample product and synthetic fixtures.',
      qualityNotes: [
        `${granules.length} NISAR GUNW granules with acquisition pairs bracketing the M7.7 event are catalogued for this region`,
        'Browse images are the official SDS renderings (geocoded unwrapped phase) served by the ASF cloud',
      ],
    },
    geometry: {
      wavelength: 0.2360571,
      incidenceAngleDeg: 34,
      headingDeg: -167.5,
      passDirection: 'descending',
      lookDirection: 'right',
    },
    numberOfLooks: 119,
    footprintPolygon: poly,
    center: { lat: ev.lat, lon: ev.lon },
  };

  // Expose the event + granules via attached fields (typed loosely; the API
  // layer reads them explicitly).
  (ds as ScienceDataset & {
    event?: typeof evLite;
    granules?: PanamaGranuleRecord[];
    browseFiles?: string[];
  }).event = evLite;
  (ds as ScienceDataset & { granules?: PanamaGranuleRecord[] }).granules = granules;
  (ds as ScienceDataset & { browseFiles?: string[] }).browseFiles = browseFiles;
  return ds;
}

// ---------------------------------------------------------------------------
// Registry with lazy caching.

const cache = new Map<string, ScienceDataset>();

function synthetic(name: 'strikeslip' | 'thrust' | 'null'): ScienceDataset {
  if (name === 'strikeslip') return syntheticStrikeSlipFixture();
  if (name === 'thrust') return syntheticThrustFixture();
  return syntheticNullFixture();
}

export function getDataset(id: string): ScienceDataset | undefined {
  if (cache.has(id)) return cache.get(id);

  let ds: ScienceDataset | undefined;
  if (id === 'real-nisar-la-2008') {
    ds = loadDerivedDataset(
      path.join(DERIVED_ROOT, 'nisar-la-2008'),
      'https://nisar.jpl.nasa.gov/data/sample-data/ (NISAR-SAMPLE-DATA, open access)',
      'Openly distributed official NISAR sample product (ALOS PALSAR data processed through the NISAR SDS).',
    );
  } else if (id === 'evidence-panama-2026') {
    ds = loadPanamaEvidenceDataset();
  } else if (id.startsWith('synthetic-')) {
    const kind = id.replace('synthetic-', '') as 'strikeslip' | 'thrust' | 'null';
    ds = synthetic(kind);
  }
  if (ds) cache.set(id, ds);
  return ds;
}

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
  center: { lat: number; lon: number } | undefined;
}

export function listDatasets(): DatasetListEntry[] {
  const ids = [
    'evidence-panama-2026',
    'real-nisar-la-2008',
    'synthetic-strikeslip',
    'synthetic-thrust',
    'synthetic-null',
  ];
  return ids.map((id) => {
    const ds = getDataset(id)!;
    return {
      id: ds.id,
      slug: ds.slug,
      title: ds.title,
      blurb: ds.blurb,
      mode: ds.mode,
      dataClass: ds.provenance.dataClass,
      isSynthetic: !!ds.isSynthetic,
      sensor: ds.provenance.platform,
      referenceTime: ds.provenance.referenceTime,
      secondaryTime: ds.provenance.secondaryTime,
      temporalBaselineDays: ds.provenance.temporalBaselineDays,
      center: ds.center,
    };
  });
}

/** Evidence-mode extras (Panama): event, granules, browse files. */
export function getEvidenceExtras(id: string): {
  event?: unknown;
  granules?: unknown;
  browseFiles?: string[];
} {
  const ds = getDataset(id) as
    | (ScienceDataset & { event?: unknown; granules?: unknown; browseFiles?: string[] })
    | undefined;
  if (!ds) return {};
  return { event: ds.event, granules: ds.granules, browseFiles: ds.browseFiles };
}
