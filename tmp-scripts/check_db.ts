import { db } from '../src/lib/db'
async function main() {
  const runs = await db.analysisRun.findMany({ orderBy: { createdAt: 'desc' }, take: 25 })
  for (const r of runs) {
    const s = r.summaryJson ? JSON.parse(r.summaryJson) : null
    const keys = s ? Object.keys(s).slice(0, 30).join(',') : ''
    console.log(`${r.createdAt.toISOString()} | ${r.datasetId} | ${r.status}`)
    if (s) console.log(`   keys: ${keys}`)
  }
  console.log(`total: ${await db.analysisRun.count()}`)
}
main().catch(e => { console.error(e); process.exit(1) })
