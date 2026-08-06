import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

async function fetchDexIds(slug) {
  const r = await fetch(`https://pokeapi.co/api/v2/pokedex/${slug}`)
  if (!r.ok) throw new Error(`${slug} ${r.status}`)
  const j = await r.json()
  return j.pokemon_entries
    .map((e) => {
      const id = Number(e.pokemon_species.url.replace(/\/$/, '').split('/').pop())
      return { entry: e.entry_number, id }
    })
    .sort((a, b) => a.entry - b.entry)
    .map((e) => e.id)
    .filter((id) => id >= 1 && id <= 1025)
}

function range(a, b) {
  const out = []
  for (let i = a; i <= b; i++) out.push(i)
  return out
}

function uniq(ids) {
  const seen = new Set()
  const out = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

const slugs = [
  'kanto',
  'original-johto',
  'updated-johto',
  'hoenn',
  'updated-hoenn',
  'original-sinnoh',
  'extended-sinnoh',
  'original-unova',
  'updated-unova',
  'kalos-central',
  'kalos-coastal',
  'kalos-mountain',
  'original-alola',
  'updated-alola',
  'letsgo-kanto',
  'galar',
  'isle-of-armor',
  'crown-tundra',
  'hisui',
  'paldea',
  'kitakami',
  'blueberry',
]

const maps = {}
for (const s of slugs) {
  console.error('fetch', s)
  maps[s] = await fetchDexIds(s)
}

const kalos = uniq([
  ...maps['kalos-central'],
  ...maps['kalos-coastal'],
  ...maps['kalos-mountain'],
])
const galarFull = uniq([
  ...maps['galar'],
  ...maps['isle-of-armor'],
  ...maps['crown-tundra'],
])
const paldeaFull = uniq([
  ...maps['paldea'],
  ...maps['kitakami'],
  ...maps['blueberry'],
])

const lists = {
  ...maps,
  kalos,
  'galar-full': galarFull,
  'paldea-full': paldeaFull,
  'gen-1': range(1, 151),
  'gen-2': range(152, 251),
  'gen-3': range(252, 386),
  'gen-4': range(387, 493),
  'gen-5': range(494, 649),
  'gen-6': range(650, 721),
  'gen-7': range(722, 809),
  'gen-8': range(810, 905),
  'gen-9': range(906, 1025),
  national: range(1, 1025),
}

const out = join(root, 'src/data/dexTemplateLists.json')
writeFileSync(out, JSON.stringify(lists))
console.log(
  Object.fromEntries(Object.entries(lists).map(([k, v]) => [k, v.length])),
)
console.log('wrote', out)
