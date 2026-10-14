#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/**
 * Map every TCGdex card (pt/en/ja) missing from Supabase.
 * Usage: npm run cards:universe-gap [-- --fix]
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizeCatalogCardId } from '../src/api/cardKeys'
import { createSupabaseAdmin, isSupabaseAdminConfigured } from '../src/lib/supabaseAdmin'
import { fetchJson } from '../src/ingestion/retry'
import { SyncManager } from '../src/ingestion/jobs/syncManager'
import { createImportSources } from '../src/ingestion/sources/pokemonTcg/githubSource'

const API_BASE = process.env.TCGDEX_API_URL ?? 'https://api.tcgdex.net/v2'
const LANGS = ['pt', 'en', 'ja'] as const
type Lang = (typeof LANGS)[number]

type SetSummary = { id: string; name: string; cardCount?: { total?: number; official?: number } }
type CardRef = { id: string; name: string; localId: string | number }

async function fetchSets(lang: Lang): Promise<SetSummary[]> {
  return fetchJson<SetSummary[]>(`${API_BASE}/${lang}/sets`, { maxRetries: 3, timeoutMs: 60000 })
}

async function fetchSetCards(lang: Lang, setId: string): Promise<CardRef[]> {
  try {
    const set = await fetchJson<{ cards?: CardRef[] }>(`${API_BASE}/${lang}/sets/${setId}`, {
      maxRetries: 2,
      timeoutMs: 30000,
    })
    return (set.cards ?? []).map((c) => ({ ...c, id: String(c.id) }))
  } catch {
    return []
  }
}

function parseArgs() {
  return { fix: process.argv.includes('--fix') }
}

async function loadDbIndex(db: ReturnType<typeof createSupabaseAdmin>) {
  const cards = new Set<string>()
  const translations = new Map<string, Set<string>>()
  const idToCanonical = new Map<string, string>()
  let offset = 0
  const page = 1000
  while (true) {
    const { data, error } = await db
      .from('cards')
      .select('id, canonical_id')
      .order('canonical_id', { ascending: true })
      .range(offset, offset + page - 1)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      cards.add(row.canonical_id)
      idToCanonical.set(row.id, row.canonical_id)
    }
    if (data.length < page) break
    offset += page
  }

  offset = 0
  while (true) {
    const { data, error } = await db
      .from('card_translations')
      .select('card_id, language')
      .order('card_id', { ascending: true })
      .range(offset, offset + page - 1)
    if (error) throw error
    if (!data?.length) break
    for (const row of data) {
      const cid = idToCanonical.get(row.card_id)
      if (!cid) continue
      for (const key of [cid, normalizeCatalogCardId(cid)]) {
        if (!translations.has(key)) translations.set(key, new Set())
        translations.get(key)!.add(row.language)
      }
    }
    if (data.length < page) break
    offset += page
  }

  return { cards, translations, normalized: new Set([...cards].map(normalizeCatalogCardId)) }
}

function isInDb(id: string, dbIndex: Awaited<ReturnType<typeof loadDbIndex>>): boolean {
  const norm = normalizeCatalogCardId(id)
  return dbIndex.cards.has(id) || dbIndex.cards.has(norm) || dbIndex.normalized.has(norm)
}

async function main() {
  const { fix } = parseArgs()
  console.log('Mapeamento universo TCGdex (pt / en / ja) vs Supabase\n')

  if (!isSupabaseAdminConfigured()) {
    console.error('✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createSupabaseAdmin()
  const dbIndex = await loadDbIndex(db)

  const universeByLang = new Map<Lang, Map<string, CardRef>>()
  const setNames = new Map<string, string>()

  for (const lang of LANGS) {
    console.log(`Buscando sets ${lang.toUpperCase()}…`)
    const sets = await fetchSets(lang)
    const byId = new Map<string, CardRef>()
    for (const set of sets) {
      setNames.set(set.id, set.name)
      const cards = await fetchSetCards(lang, set.id)
      for (const c of cards) {
        byId.set(c.id, c)
      }
    }
    universeByLang.set(lang, byId)
    console.log(`  ${sets.length} sets, ${byId.size} cartas únicas`)
  }

  const allIds = new Set<string>()
  for (const map of universeByLang.values()) {
    for (const id of map.keys()) allIds.add(id)
  }

  const missingFromDb: Array<{ id: string; name: string; langs: Lang[] }> = []
  const missingTranslations: Array<{ id: string; name: string; missing: string[] }> = []

  for (const id of allIds) {
    const langsPresent: Lang[] = []
    let name = id
    for (const lang of LANGS) {
      const card = universeByLang.get(lang)?.get(id)
      if (card) {
        langsPresent.push(lang)
        name = card.name || name
      }
    }

    const dbKey = normalizeCatalogCardId(id)
    if (!isInDb(id, dbIndex)) {
      missingFromDb.push({ id, name, langs: langsPresent })
      continue
    }

    const have = dbIndex.translations.get(dbKey) ?? dbIndex.translations.get(id) ?? new Set<string>()
    const want: string[] = []
    if (universeByLang.get('pt')?.has(id) && !have.has('pt-BR')) want.push('pt-BR')
    if (universeByLang.get('en')?.has(id) && !have.has('en')) want.push('en')
    if (universeByLang.get('ja')?.has(id) && !have.has('ja')) want.push('ja')
    if (want.length) missingTranslations.push({ id, name, missing: want })
  }

  const bySet = new Map<string, typeof missingFromDb>()
  for (const m of missingFromDb) {
    const setId = m.id.includes('-') ? m.id.slice(0, m.id.lastIndexOf('-')) : m.id
    if (!bySet.has(setId)) bySet.set(setId, [])
    bySet.get(setId)!.push(m)
  }

  const incompleteSets = [...bySet.entries()]
    .map(([setId, cards]) => ({ setId, setName: setNames.get(setId) ?? setId, count: cards.length, cards }))
    .sort((a, b) => b.count - a.count)

  console.log('\n=== Resumo ===')
  console.log(`Universo TCGdex (união pt+en+ja): ${allIds.size} cartas`)
  console.log(`No banco (canonical_id): ${dbIndex.cards.size}`)
  console.log(`Cartas ausentes no banco: ${missingFromDb.length}`)
  console.log(`Cartas no banco sem tradução completa: ${missingTranslations.length}`)

  if (incompleteSets.length) {
    console.log('\n=== Sets com cartas ausentes ===')
    for (const s of incompleteSets.slice(0, 20)) {
      console.log(`  ${s.setId} (${s.setName}): ${s.count} faltando`)
      for (const c of s.cards.slice(0, 5)) {
        console.log(`    - ${c.id} ${c.name} [${c.langs.join(',')}]`)
      }
      if (s.cards.length > 5) console.log(`    … +${s.cards.length - 5}`)
    }
    if (incompleteSets.length > 20) console.log(`  … +${incompleteSets.length - 20} sets`)
  }

  const reportPath = join(process.cwd(), 'docs', 'catalog-universe-gap.json')
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        totals: {
          universe: allIds.size,
          inDb: dbIndex.cards.size,
          missingCards: missingFromDb.length,
          missingTranslations: missingTranslations.length,
        },
        missingCards: missingFromDb,
        missingTranslations: missingTranslations.slice(0, 500),
        missingBySet: incompleteSets.map((s) => ({
          setId: s.setId,
          setName: s.setName,
          count: s.count,
          cardIds: s.cards.map((c) => c.id),
        })),
      },
      null,
      2,
    ),
  )
  console.log(`\nRelatório salvo: ${reportPath}`)

  const translationSetIds = new Set<string>()
  for (const m of missingTranslations) {
    const setId = m.id.includes('-') ? m.id.slice(0, m.id.lastIndexOf('-')) : m.id
    translationSetIds.add(setId)
  }

  const fixSetIds = new Set<string>([
    ...incompleteSets.map((s) => s.setId),
    ...translationSetIds,
  ])

  if (fix && fixSetIds.size) {
    console.log(`\nReimportando ${fixSetIds.size} sets (${incompleteSets.length} ausentes, ${translationSetIds.size} traduções)…`)
    process.env.CATALOG_IMPORT_SOURCE = 'tcgdex'
    const importSources = await createImportSources()
    const { data: src } = await db.from('data_sources').select('id').eq('name', 'tcgdex').single()
    const manager = new SyncManager(db, src?.id ?? null, {
      source: importSources.primary,
      translationSources: importSources.translations,
      checkpointSource: 'tcgdex',
      dataSourceName: 'tcgdex',
    })
    for (const setId of fixSetIds) {
      console.log(`  → ${setId}`)
      await db
        .from('sync_checkpoints')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('source', 'tcgdex')
        .eq('entity_type', 'set')
        .eq('entity_id', setId)
    }
    const stats = await manager.runImport({
      setIds: [...fixSetIds],
      langs: ['pt', 'en', 'ja'],
      skipCompleted: false,
    })
    console.log('\nFix complete:', stats)
  } else if (missingFromDb.length) {
    console.log('\nPara corrigir: npm run cards:universe-gap -- --fix')
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
