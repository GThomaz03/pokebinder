#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/**
 * Point each card at the set encoded in its canonical id.
 * TCGdex uses case to distinguish sets (`sm12` vs `SM12`). A case-insensitive
 * lookup previously attached English cards to the Japanese set.
 *
 * Usage: npm run cards:relink-sets
 */
import { setIdFromCanonicalId } from '../src/api/cards/catalogQuery'
import { createSupabaseAdmin, isSupabaseAdminConfigured } from '../src/lib/supabaseAdmin'

const PAGE = 1000

async function main() {
  if (!isSupabaseAdminConfigured()) {
    console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createSupabaseAdmin()
  const setIdBySource = new Map<string, string>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('sets')
      .select('id, source_id')
      .order('source_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data ?? []) setIdBySource.set(row.source_id, row.id)
    if (!data || data.length < PAGE) break
  }

  let scanned = 0
  let relinked = 0
  const byTarget = new Map<string, string[]>()

  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('cards')
      .select('id, canonical_id, set_id')
      .order('canonical_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const row of rows) {
      scanned++
      const sourceId = setIdFromCanonicalId(row.canonical_id)
      const target = setIdBySource.get(sourceId)
      if (!target || target === row.set_id) continue
      const bucket = byTarget.get(target) ?? []
      bucket.push(row.id)
      byTarget.set(target, bucket)
    }
    if (rows.length < PAGE) break
  }

  for (const [setId, cardIds] of byTarget) {
    for (let i = 0; i < cardIds.length; i += 200) {
      const chunk = cardIds.slice(i, i + 200)
      const { error } = await db
        .from('cards')
        .update({ set_id: setId, updated_at: new Date().toISOString() })
        .in('id', chunk)
      if (error) throw error
      relinked += chunk.length
    }
  }

  console.log(`Cartas lidas: ${scanned}`)
  console.log(`Cartas religadas: ${relinked}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
