import { NextResponse } from 'next/server';
import { listDatasets, getDataset } from '@/lib/data/datasets';

/**
 * GET /api/datasets — registry of analysis-ready datasets.
 */
export async function GET() {
  try {
    const datasets = listDatasets();
    return NextResponse.json({ ok: true, datasets });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Dataset registry failed: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}

export const dynamic = 'force-dynamic';
