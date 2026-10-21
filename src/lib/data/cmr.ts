/**
 * NASA CMR (Common Metadata Repository) search client for NISAR products.
 *
 * API: https://cmr.earthdata.nasa.gov/search/ (open for search; downloads of
 * science files from the ASF cloud require free NASA Earthdata Login).
 *
 * This client is used by the availability panel: it queries which NISAR L2
 * GUNW (unwrapped interferogram) granules exist for a region and time range,
 * and whether any acquisition pair brackets a given event window.
 */

const CMR_BASE = 'https://cmr.earthdata.nasa.gov/search';

export const NISAR_COLLECTIONS = {
  gunwProvisional: 'NISAR_L2_GUNW_PROVISIONAL_V1',
  gunwBeta: 'NISAR_L2_GUNW_BETA_V1',
  gslcProvisional: 'NISAR_L2_GSLC_PROVISIONAL_V1',
  gcovProvisional: 'NISAR_L2_GCOV_PROVISIONAL_V1',
} as const;

export interface CmrGranule {
  granuleId: string;
  timeStart: string;
  timeEnd: string;
  /** WKT-style polygon string "lat lon lat lon ..." */
  polygon: string;
  sizeMB: number;
  dataUrl?: string;
  browseUrl?: string;
  conceptId: string;
}

interface CmrEntry {
  producer_granule_id?: string;
  time_start: string;
  time_end: string;
  polygons?: string[][];
  granule_size?: string;
  id: string;
  links?: Array<{ rel: string; href: string }>;
}

/** Search NISAR GUNW granules within a bounding box and (optional) time range. */
export async function searchNisarGunw(
  bbox: [number, number, number, number],
  temporal?: { start: string; end: string },
  opts: { pageSize?: number; shortName?: string } = {},
): Promise<{ granules: CmrGranule[]; hits: number | null }> {
  const params = new URLSearchParams({
    short_name: opts.shortName ?? NISAR_COLLECTIONS.gunwProvisional,
    page_size: String(opts.pageSize ?? 50),
    bounding_box: bbox.join(','),
  });
  if (temporal) {
    // CMR temporal filter: granules overlapping [start, end]
    params.set('temporal[]', `${temporal.start},${temporal.end}`);
  }
  const url = `${CMR_BASE}/granules.json?${params.toString()}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`CMR returned HTTP ${res.status}`);
    const hitsHeader = res.headers.get('CMR-Hits');
    const data = (await res.json()) as { feed?: { entry?: CmrEntry[] } };
    const entries = data.feed?.entry ?? [];
    const granules: CmrGranule[] = entries.map((e) => {
      const links = e.links ?? [];
      const dataLink = links.find((l) => l.rel.endsWith('data#') && l.href.endsWith('.h5'));
      const browseLink = links.find(
        (l) => l.rel.endsWith('browse#') && l.href.endsWith('_LATLON.png'),
      );
      return {
        granuleId: e.producer_granule_id ?? 'unknown',
        timeStart: e.time_start,
        timeEnd: e.time_end,
        polygon: e.polygons?.[0]?.[0] ?? '',
        sizeMB: Math.round(parseFloat(e.granule_size ?? '0')),
        dataUrl: dataLink?.href,
        browseUrl: browseLink?.href,
        conceptId: e.id,
      };
    });
    return {
      granules,
      hits: hitsHeader ? parseInt(hitsHeader, 10) : null,
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Total granule count for a collection (fast HEAD-style query). */
export async function collectionGranuleCount(shortName: string): Promise<number | null> {
  const url = `${CMR_BASE}/granules?short_name=${encodeURIComponent(shortName)}&page_size=1`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    if (!res.ok) return null;
    const h = res.headers.get('CMR-Hits');
    return h ? parseInt(h, 10) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Parse a CMR polygon string into [lon, lat][] pairs. */
export function parseCmrPolygon(poly: string): [number, number][] {
  const nums = poly.trim().split(/\s+/).map(Number);
  const pts: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([nums[i + 1], nums[i]]); // CMR: lat lon
  }
  return pts;
}

/** Whether a granule's acquisition pair brackets an event time. */
export function bracketsEvent(granule: CmrGranule, eventTimeIso: string): boolean {
  const t = Date.parse(eventTimeIso);
  return Date.parse(granule.timeStart) < t && Date.parse(granule.timeEnd) > t;
}
