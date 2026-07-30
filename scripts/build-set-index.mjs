/**
 * Build public/scan/set-index.json from TCGdex sets API.
 * Usage: node scripts/build-set-index.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'scan')

/** Well-known printed abbreviations → TCGdex set id */
const EXTRA_ABBR = {
  sve: 'sve',
  sv1: 'sv01',
  sv01: 'sv01',
  sv2: 'sv02',
  sv02: 'sv02',
  pal: 'sv02',
  sv3: 'sv03',
  sv03: 'sv03',
  obf: 'sv03',
  'sv3.5': 'sv03.5',
  mew: 'sv03.5',
  sv4: 'sv04',
  sv04: 'sv04',
  par: 'sv04',
  sv5: 'sv05',
  sv05: 'sv05',
  tef: 'sv05',
  sv6: 'sv06',
  sv06: 'sv06',
  twm: 'sv06',
  'sv6.5': 'sv06.5',
  sv7: 'sv07',
  sv07: 'sv07',
  scr: 'sv07',
  sv8: 'sv08',
  sv08: 'sv08',
  ssp: 'sv08',
  'sv8.5': 'sv08.5',
  pre: 'sv08.5',
  sv9: 'sv09',
  sv09: 'sv09',
  jtg: 'sv09',
  sv10: 'sv10',
  dri: 'sv10',
  me01: 'me01',
  m1: 'me01',
  me02: 'me02',
  m2: 'me02',
  pfl: 'me02',
  ev7: 'ev7',
  ev8: 'ev8',
  ev10: 'ev10',
}

async function main() {
  mkdirSync(outDir, { recursive: true })
  const res = await fetch('https://api.tcgdex.net/v2/en/sets')
  if (!res.ok) throw new Error(`sets ${res.status}`)
  const data = await res.json()

  const sets = data.map((s) => ({
    id: s.id,
    name: s.name,
    official: s.cardCount?.official ?? 0,
    total: s.cardCount?.total ?? 0,
  }))

  const abbr = { ...EXTRA_ABBR }
  for (const s of sets) {
    abbr[s.id.toLowerCase()] = s.id
    // also map id without leading zeros in digits: sv08 already
  }

  const byOfficial = {}
  for (const s of sets) {
    if (!s.official) continue
    const key = String(s.official)
    if (!byOfficial[key]) byOfficial[key] = []
    byOfficial[key].push(s.id)
  }
  // Prefer modern ids first in each bucket
  for (const key of Object.keys(byOfficial)) {
    byOfficial[key].sort((a, b) => {
      const score = (id) =>
        (id.startsWith('me') ? 30 : 0) +
        (id.startsWith('sv') ? 20 : 0) +
        (id.startsWith('swsh') ? 10 : 0)
      return score(b) - score(a)
    })
  }

  const out = { abbr, byOfficial, sets, generatedAt: new Date().toISOString() }
  writeFileSync(join(outDir, 'set-index.json'), JSON.stringify(out, null, 2))
  console.log(
    `Wrote set-index.json (${sets.length} sets, ${Object.keys(byOfficial).length} size buckets)`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
