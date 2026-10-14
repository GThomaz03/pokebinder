#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'

loadEnvFile()

/**
 * Local perceptual-hash index for the scanner.
 *
 *   npm run scan:hash-pilot
 *   npm run scan:hash-pilot -- --limit=300
 *
 * The pilot is written to data/scan/ and is not published.
 * Running the command again resumes: cards already in the file are skipped.
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import sharp from 'sharp'
import { cardImageCandidates } from '../src/api/images/imageProvider'
import { bitsToHex, computeHashes } from '../src/lib/scanner/hash'
import {
  mergeHashIndex,
  parseHashIndex,
  selectPilotSample,
  type HashIndexCard,
  type HashIndexFile,
} from '../src/lib/scanner/hashIndex'

const PILOT_PATH = 'data/scan/pilot-hash-index.json'
const REPORT_PATH = 'data/scan/pilot-report.json'
const DEFAULT_LIMIT = 300
const PER_SET_CAP = 6
const PAGE_SIZE = 1000
const DOWNLOAD_CONCURRENCY = 4

type Row = {
  canonical_id: string
  name: string
  number: string | null
  language: string | null
  image_low_url: string | null
  image_url: string | null
  image_high_url: string | null
  sets?: { source_id?: string; name?: string } | { source_id?: string; name?: string }[] | null
}

type Failure = { id: string; message: string }

function argValue(name: string): string | undefined {
  const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function client(): { db: SupabaseClient; keyKind: 'anon' } {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    throw new Error('Defina SUPABASE_URL (ou VITE_SUPABASE_URL) e VITE_SUPABASE_ANON_KEY. A chave de serviço não é usada.')
  }
  return {
    keyKind: 'anon',
    db: createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }),
  }
}

async function listCards(db: SupabaseClient): Promise<Row[]> {
  const cards: Row[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from('cards')
      .select('canonical_id, name, number, language, image_low_url, image_url, image_high_url, sets(source_id, name)')
      .not('image_low_url', 'is', null)
      .order('canonical_id')
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    cards.push(...(data as Row[]))
    if (data.length < PAGE_SIZE) break
    if (cards.length % 5000 === 0) console.log(`metadados lidos: ${cards.length}`)
  }
  return cards
}

async function downloadRaster(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return { data: new Uint8ClampedArray(data), width: info.width, height: info.height }
}

function imageOf(row: Row): string | undefined {
  return row.image_low_url ?? row.image_url ?? row.image_high_url ?? undefined
}

function setOf(row: Row): { source_id?: string; name?: string } | null {
  if (!row.sets) return null
  return Array.isArray(row.sets) ? (row.sets[0] ?? null) : row.sets
}

async function hashRow(row: Row): Promise<HashIndexCard> {
  const image = imageOf(row)
  const urls = cardImageCandidates(image, 'low')
  if (!urls.length) throw new Error('sem URL de imagem')
  let last = 'sem URL de imagem'
  for (const url of urls) {
    try {
      const raster = await downloadRaster(url)
      const hashes = computeHashes(raster)
      const set = setOf(row)
      return {
        id: row.canonical_id,
        name: row.name,
        localId: row.number ?? '',
        setId: set?.source_id,
        setName: set?.name,
        image,
        language: row.language ?? undefined,
        phash: bitsToHex(hashes.phash),
        dhash: bitsToHex(hashes.dhash),
        phashR: bitsToHex(hashes.phashR),
        phashG: bitsToHex(hashes.phashG),
        phashB: bitsToHex(hashes.phashB),
      }
    } catch (err) {
      last = err instanceof Error ? err.message : 'falha no download'
    }
  }
  throw new Error(last)
}

function readExisting(path: string): HashIndexFile | null {
  if (!existsSync(path)) return null
  try {
    return parseHashIndex(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return null
  }
}

function writeIndex(path: string, index: HashIndexFile) {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(index))
  renameSync(tmp, path)
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

async function main() {
  if (hasFlag('publish') || hasFlag('full')) {
    throw new Error('Nesta fase o índice completo não é gerado nem publicado. Use npm run scan:hash-pilot.')
  }
  if (!hasFlag('pilot') && !argValue('limit')) {
    console.log('Use npm run scan:hash-pilot para gerar o índice local em data/scan/. Nada é publicado.')
    return
  }

  const limit = Math.max(1, Math.min(500, Number(argValue('limit') ?? DEFAULT_LIMIT)))
  const out = resolve(process.cwd(), PILOT_PATH)
  const reportPath = resolve(process.cwd(), REPORT_PATH)
  const started = Date.now()
  const { db, keyKind } = client()
  console.log(`piloto local, limite ${limit}, chave ${keyKind}`)

  const existing = readExisting(out)
  const already = new Set(existing?.cards.map((card) => card.id) ?? [])
  const catalog = await listCards(db)
  const catalogRows = catalog.map((row) => ({
    row,
    id: row.canonical_id,
    language: row.language ?? undefined,
    setId: setOf(row)?.source_id,
  }))
  const sample = selectPilotSample(catalogRows, Math.max(0, limit - already.size), already, PER_SET_CAP)
  console.log(`catálogo com imagem: ${catalog.length}; já no piloto: ${already.size}; a baixar: ${sample.length}`)

  const failures: Failure[] = []
  const added: HashIndexCard[] = []
  let index = existing ?? mergeHashIndex(null, [])
  let finished = 0
  let writing = Promise.resolve()

  function checkpoint() {
    writing = writing.then(() => {
      index = mergeHashIndex(existing, added)
      index.scope = 'pilot'
      index.skipped = failures.length
      writeIndex(out, index)
    })
    return writing
  }

  await mapPool(sample, DOWNLOAD_CONCURRENCY, async (row) => {
    try {
      added.push(await hashRow(row.row))
    } catch (err) {
      failures.push({ id: row.id, message: err instanceof Error ? err.message : 'falha' })
    }
    finished++
    if (finished % 20 === 0 || finished === sample.length) {
      console.log(`progresso ${finished}/${sample.length}; falhas ${failures.length}`)
      await checkpoint()
    }
  })
  await writing

  index = mergeHashIndex(existing, added)
  index.scope = 'pilot'
  index.skipped = failures.length
  writeIndex(out, index)
  const bytes = statSync(out).size
  const languages: Record<string, number> = {}
  const sets = new Set<string>()
  for (const card of index.cards) {
    const lang = card.language || 'unknown'
    languages[lang] = (languages[lang] ?? 0) + 1
    if (card.setId) sets.add(card.setId)
  }
  const report = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    requested: limit,
    catalogWithImage: catalog.length,
    alreadyIndexed: already.size,
    downloaded: added.length,
    failed: failures.length,
    indexCards: index.cardCount,
    indexBytes: bytes,
    languages,
    sets: sets.size,
    failures: failures.slice(0, 50),
    output: PILOT_PATH,
    published: false,
    keyKind,
  }
  writeFileSync(reportPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, failures: failures.length }, null, 2))
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
