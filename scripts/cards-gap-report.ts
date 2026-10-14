#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/**
 * Compare TCGdex catalog vs Supabase — lists sets missing sync or PT coverage.
 * Usage: npm run cards:gap-report
 */
import { createSupabaseAdmin, isSupabaseAdminConfigured } from '../src/lib/supabaseAdmin'
import { fetchJson } from '../src/ingestion/retry'
import { TcgdexApiSource } from '../src/ingestion/sources/tcgdex/apiSource'

const API_BASE = process.env.TCGDEX_API_URL ?? 'https://api.tcgdex.net/v2'

async function tcgdxSetIds(lang: 'en' | 'pt' | 'ja'): Promise<Map<string, { name: string; total?: number }>> {
  const rows = await fetchJson<Array<{ id: string; name: string; cardCount?: { total?: number; official?: number } }>>(
    `${API_BASE}/${lang}/sets`,
    { maxRetries: 3, timeoutMs: 30000 },
  )
  const map = new Map<string, { name: string; total?: number }>()
  for (const s of rows) {
    map.set(s.id, { name: s.name, total: s.cardCount?.official ?? s.cardCount?.total })
  }
  return map
}

async function main() {
  console.log('Relatório de lacunas — catálogo TCGdex vs Supabase\n')

  if (!isSupabaseAdminConfigured()) {
    console.error('✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createSupabaseAdmin()

  const [enSets, ptSets, jaSets] = await Promise.all([
    tcgdxSetIds('en'),
    tcgdxSetIds('pt'),
    tcgdxSetIds('ja'),
  ])

  const { data: dbSets } = await db
    .from('sets')
    .select('id, source_id, name, pt_name, jp_name, official_total, total_cards')

  const { data: coverage } = await db.from('set_coverage').select('set_id, expected_cards, imported_cards, missing_cards')

  const { data: checkpoints } = await db
    .from('sync_checkpoints')
    .select('entity_id, status, metadata')
    .eq('entity_type', 'set')

  const coverageBySetId = new Map((coverage ?? []).map((c) => [c.set_id, c]))
  const checkpointBySet = new Map((checkpoints ?? []).map((c) => [c.entity_id, c]))

  const dbBySourceId = new Map((dbSets ?? []).map((s) => [s.source_id, s]))

  const missingInDb: string[] = []
  for (const id of enSets.keys()) {
    if (!dbBySourceId.has(id)) missingInDb.push(id)
  }

  const incomplete: Array<{ id: string; name: string; expected: number; imported: number; missing: number }> = []
  const noPtName: string[] = []
  const failedSync: string[] = []

  for (const s of dbSets ?? []) {
    if (!s.pt_name) noPtName.push(s.source_id)
    const cov = coverageBySetId.get(s.id)
    if (cov && cov.missing_cards > 0) {
      incomplete.push({
        id: s.source_id,
        name: s.name,
        expected: cov.expected_cards,
        imported: cov.imported_cards,
        missing: cov.missing_cards,
      })
    }
    const cp = checkpointBySet.get(s.source_id)
    if (cp?.status === 'failed') failedSync.push(s.source_id)
  }

  const { count: cardCount } = await db.from('cards').select('*', { count: 'exact', head: true })
  const { data: langRows } = await db.from('cards').select('language')
  const langCounts = new Map<string, number>()
  for (const r of langRows ?? []) {
    langCounts.set(r.language, (langCounts.get(r.language) ?? 0) + 1)
  }

  const { count: ptTranslationCount } = await db
    .from('card_translations')
    .select('*', { count: 'exact', head: true })
    .eq('language', 'pt-BR')

  console.log('=== TCGdex (fonte) ===')
  console.log(`Sets EN: ${enSets.size}`)
  console.log(`Sets PT: ${ptSets.size}`)
  console.log(`Sets JA: ${jaSets.size}`)

  console.log('\n=== Supabase (atual) ===')
  console.log(`Sets: ${dbSets?.length ?? 0}`)
  console.log(`Cartas: ${cardCount ?? 0}`)
  console.log('Idioma principal (cards.language):')
  for (const [lang, cnt] of [...langCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${cnt}`)
  }
  console.log(`Traduções pt-BR: ${ptTranslationCount ?? 0}`)

  console.log('\n=== Lacunas ===')
  console.log(`Sets na TCGdex ausentes no banco: ${missingInDb.length}`)
  if (missingInDb.length) {
    console.log(`  Ex.: ${missingInDb.slice(0, 15).join(', ')}${missingInDb.length > 15 ? '…' : ''}`)
  }
  console.log(`Sets incompletos (missing_cards > 0): ${incomplete.length}`)
  for (const s of incomplete.slice(0, 10)) {
    console.log(`  ${s.id} — ${s.name}: ${s.imported}/${s.expected} (faltam ${s.missing})`)
  }
  console.log(`Sets sem pt_name: ${noPtName.length}`)
  console.log(`Checkpoints failed (sync antigo): ${failedSync.length}`)
  if (failedSync.length) {
    console.log(`  Ex.: ${failedSync.slice(0, 15).join(', ')}${failedSync.length > 15 ? '…' : ''}`)
  }

  const needsResync = new Set<string>([
    ...missingInDb,
    ...incomplete.map((s) => s.id),
    ...failedSync,
    ...noPtName,
  ])

  console.log(`\n=== Ação recomendada ===`)
  console.log(`Sets a (re)sincronizar com prioridade pt→en→ja: ${needsResync.size}`)
  console.log(`Comando: npm run cards:import -- --source=tcgdex --full`)
  console.log(`  (ou incremental: npm run cards:sync)`)

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
