import { NextResponse } from 'next/server';
import {
  getDataset,
  getEvidenceExtras,
  getDatasetAvailability,
  listDatasets,
} from '@/lib/data/datasets';

/**
 * GET /api/datasets/[id] — full dataset metadata + provenance.
 *
 * Known dataset ids resolve to 200 even when the local scientific data is
 * absent: the response then carries `availability` with a structured state
 * and the registry's fallback description, so the UI can explain exactly
 * what is missing and how to obtain it. Only truly unknown ids 404.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const availability = getDatasetAvailability(id);
    const known =
      availability.state === 'available' ||
      listDatasets().some((d) => d.id === id);
    if (!known) {
      return NextResponse.json({ ok: false, error: `Unknown dataset: ${id}` }, { status: 404 });
    }

    const ds = getDataset(id);
    if (!ds) {
      // Configured but the local data is missing/incomplete/invalid.
      const entry = listDatasets().find((d) => d.id === id)!;
      return NextResponse.json({
        ok: true,
        dataset: {
          id: entry.id,
          slug: entry.slug,
          title: entry.title,
          blurb: entry.blurb,
          mode: entry.mode,
          isSynthetic: entry.isSynthetic,
          provenance: {
            datasetId: entry.id,
            provider: entry.sensor,
            dataClass: entry.dataClass,
          },
          availability: entry.availability,
        },
        availability: entry.availability,
      });
    }

    const extras = getEvidenceExtras(id);
    const granules = (extras.granules as Array<Record<string, unknown>> | undefined) ?? [];
    const event = extras.event as Record<string, unknown> | undefined;
    return NextResponse.json({
      ok: true,
      dataset: {
        id: ds.id,
        slug: ds.slug,
        title: ds.title,
        blurb: ds.blurb,
        mode: ds.mode,
        isSynthetic: !!ds.isSynthetic,
        provenance: ds.provenance,
        geometry: ds.geometry,
        footprintPolygon: ds.footprintPolygon,
        center: ds.center,
        grid: ds.phase
          ? { width: ds.phase.meta.width, height: ds.phase.meta.height, epsg: ds.phase.meta.epsg }
          : undefined,
        numberOfLooks: ds.numberOfLooks,
        availability,
      },
      event,
      granules: granules.map((g) => ({
        ...g,
        localBrowseUrl: `/api/external/browse?granule=${encodeURIComponent(String(g.granuleId))}`,
      })),
      granuleSelection: extras.granuleSelection,
      browseCount: extras.browseFiles?.length ?? 0,
      availability,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Dataset load failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
