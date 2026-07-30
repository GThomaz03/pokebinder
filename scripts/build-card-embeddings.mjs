/**
 * Build MobileCLIP embeddings for TCGdex cards (same model as the browser worker).
 *
 * Usage:
 *   npm run scan:embeddings
 *   npm run scan:embeddings -- --sets sv-me
 *   npm run scan:embeddings -- --sets all --limit 500
 *   npm run scan:embeddings -- --sets me01,me02,sv08,sv09
 *
 * Writes public/scan/embeddings.json + embeddings.bin
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AutoProcessor,
  CLIPVisionModelWithProjection,
  RawImage,
  env,
} from '@xenova/transformers'

const MODEL_ID = 'Xenova/mobileclip_s2'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'public', 'scan')

env.allowLocalModels = false

function parseArgs(argv) {
  const out = { sets: 'sv-me', lang: 'en', limit: 0 }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--sets' && argv[i + 1]) out.sets = argv[++i]
    else if (a === '--lang' && argv[i + 1]) out.lang = argv[++i]
    else if (a === '--limit' && argv[i + 1]) out.limit = Number(argv[++i]) || 0
  }
  return out
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

function cardImage(imageBase) {
  if (!imageBase) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(imageBase)) return imageBase
  return `${imageBase}/low.webp`
}

async function resolveSetIds(lang, spec) {
  if (spec !== 'sv-me' && spec !== 'all' && !spec.includes(',')) {
    return [spec]
  }
  if (spec.includes(',') && spec !== 'sv-me' && spec !== 'all') {
    return spec.split(',').map((s) => s.trim()).filter(Boolean)
  }
  const sets = await fetchJson(`https://api.tcgdex.net/v2/${lang}/sets`)
  if (spec === 'all') return sets.map((s) => s.id)
  return sets
    .map((s) => s.id)
    .filter((id) => id.startsWith('sv') || id.startsWith('me'))
    .sort()
}

async function listSetCards(lang, setId) {
  const data = await fetchJson(`https://api.tcgdex.net/v2/${lang}/sets/${setId}`)
  return (data.cards ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    localId: String(c.localId),
    setId,
    image: cardImage(c.image),
  }))
}

function l2normalize(data) {
  const out = new Float32Array(data.length)
  let n = 0
  for (let i = 0; i < data.length; i++) n += data[i] * data[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < data.length; i++) out[i] = data[i] / n
  return out
}

async function main() {
  const args = parseArgs(process.argv)
  mkdirSync(outDir, { recursive: true })
  mkdirSync(join(outDir, 'models'), { recursive: true })

  console.log(`Loading vision model ${MODEL_ID}…`)
  const processor = await AutoProcessor.from_pretrained(MODEL_ID)
  const vision = await CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
    quantized: true,
  })

  const setIds = await resolveSetIds(args.lang, args.sets)
  console.log(`Sets (${setIds.length}): ${setIds.slice(0, 12).join(', ')}${setIds.length > 12 ? '…' : ''}`)

  const cards = []
  for (const setId of setIds) {
    try {
      process.stdout.write(`Fetch ${setId}… `)
      const list = await listSetCards(args.lang, setId)
      cards.push(...list)
      console.log(`${list.length} cards`)
    } catch (err) {
      console.warn(`skip: ${err.message ?? err}`)
    }
  }

  const unique = []
  const seen = new Set()
  for (const c of cards) {
    if (seen.has(c.id)) continue
    seen.add(c.id)
    unique.push(c)
  }
  const work = args.limit > 0 ? unique.slice(0, args.limit) : unique
  console.log(`Embedding ${work.length} cards with ${MODEL_ID}…`)

  let dim = 0
  const vectors = []
  const metaCards = []

  for (let i = 0; i < work.length; i++) {
    const c = work[i]
    if (!c.image) {
      console.warn(`No image ${c.id}`)
      continue
    }
    try {
      // Prefer EN art CDN path
      let imageUrl = c.image
      if (!imageUrl.includes('/en/')) {
        imageUrl = imageUrl.replace(/\/(pt|ja|fr|de|es|it)\//i, '/en/')
      }
      const image = await RawImage.read(imageUrl)
      const inputs = await processor(image)
      const { image_embeds } = await vision(inputs)
      const raw = image_embeds.data
      const data = raw instanceof Float32Array ? raw : new Float32Array(raw)
      // image_embeds may be [1, dim]
      const flat = data.length > 1024 ? data.subarray(data.length - 512) : data
      const vec = l2normalize(flat.length === 512 || flat.length === 768 ? flat : data)
      if (!dim) dim = vec.length
      vectors.push(vec.length === dim ? vec : l2normalize(data.subarray(0, dim)))
      metaCards.push({
        id: c.id,
        name: c.name,
        localId: c.localId,
        setId: c.setId,
        image: imageUrl.replace('/low.webp', '/high.webp'),
      })
      if ((i + 1) % 20 === 0 || i === work.length - 1) {
        console.log(`  ${metaCards.length}/${work.length} ok`)
      }
    } catch (err) {
      console.warn(`Fail ${c.id}:`, err.message ?? err)
    }
  }

  if (!metaCards.length || !dim) {
    console.error('No embeddings produced.')
    process.exit(1)
  }

  const bin = new Float32Array(metaCards.length * dim)
  for (let i = 0; i < vectors.length; i++) bin.set(vectors[i], i * dim)

  writeFileSync(
    join(outDir, 'embeddings.json'),
    JSON.stringify(
      {
        dim,
        model: MODEL_ID,
        cards: metaCards,
        generatedAt: new Date().toISOString(),
        count: metaCards.length,
      },
      null,
      2,
    ),
  )
  writeFileSync(join(outDir, 'embeddings.bin'), Buffer.from(bin.buffer))
  console.log(`Wrote ${metaCards.length} × ${dim} → public/scan/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
