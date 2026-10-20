import { NextResponse } from 'next/server';
import { getDataset, getEvidenceExtras } from '@/lib/data/datasets';

/**
 * GET /api/datasets/[id] — full dataset metadata + provenance.
 * For evidence-mode datasets the response includes the cached event record,
 * granule catalogue and local browse-image URLs.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ds = getDataset(id);
    if (!ds) {
      return NextResponse.json({ ok: false, error: `Unknown dataset: ${id}` }, { status: 404 });
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
      },
      event,
      granules: granules.map((g) => ({
        ...g,
        localBrowseUrl: `/api/external/browse?granule=${encodeURIComponent(String(g.granuleId))}`,
      })),
      browseCount: extras.browseFiles?.length ?? 0,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Dataset load failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
