import { db } from '../src/lib/db'
import { writeFileSync } from 'fs'
async function main() {
  const runs = await db.analysisRun.findMany({ where: { datasetId: 'real-nisar-mojave-2026' }, orderBy: { createdAt: 'desc' } })
  console.log(`mojave runs: ${runs.length}`)
  const r = runs[0]
  const out = {
    recordedAt: r.createdAt.toISOString(),
    status: r.status,
    params: JSON.parse(r.paramsJson),
    summary: JSON.parse(r.summaryJson || '{}'),
    durationMs: r.durationMs,
  }
  writeFileSync('/tmp/mojave_recorded.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out.summary, null, 2))
  console.log('params:', JSON.stringify(out.params))
}
main().catch(e => { console.error(e); process.exit(1) })
