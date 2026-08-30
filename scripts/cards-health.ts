#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/** Database health diagnostic for catalog tables. */
import { createSupabaseAdmin, isSupabaseAdminConfigured } from '../src/lib/supabaseAdmin'

async function count(db: ReturnType<typeof createSupabaseAdmin>, table: string) {
  const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

async function main() {
  console.log('Pokemon TCG Database Health\n')
  if (!isSupabaseAdminConfigured()) {
    console.log('✗ Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createSupabaseAdmin()
  const checks: Array<[string, boolean]> = []

  try {
    await db.from('cards').select('id').limit(1)
    checks.push(['Supabase connection', true])
  } catch {
    checks.push(['Supabase connection', false])
  }

  const tables = ['cards', 'sets', 'series', 'card_variants', 'card_translations', 'card_images']
  for (const t of tables) {
    try {
      await db.from(t).select('id').limit(1)
      checks.push([`${t} table`, true])
    } catch {
      checks.push([`${t} table`, false])
    }
  }

  const { data: tcgdex } = await db.from('data_sources').select('enabled,last_sync_at').eq('name', 'tcgdex').maybeSingle()
  checks.push(['TCGdex source', Boolean(tcgdex?.enabled)])

  const { data: bucket } = await db.storage.from('card-images').list('', { limit: 1 })
  checks.push(['Storage', bucket !== null])

  for (const [label, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}`)
  }

  const [cards, sets, series, variants, translations] = await Promise.all([
    count(db, 'cards'),
    count(db, 'sets'),
    count(db, 'series'),
    count(db, 'card_variants'),
    count(db, 'card_translations'),
  ])

  console.log(`\nCards: ${cards}`)
  console.log(`Sets: ${sets}`)
  console.log(`Series: ${series}`)
  console.log(`Variants: ${variants}`)
  console.log(`Translations: ${translations}`)

  const { data: incomplete } = await db
    .from('set_coverage')
    .select('missing_cards, sets(name)')
    .gt('missing_cards', 0)
    .limit(5)

  const incompleteCount = incomplete?.length ?? 0
  console.log(`\nIncomplete sets: ${incompleteCount}`)

  const { count: noImage } = await db
    .from('cards')
    .select('*', { count: 'exact', head: true })
    .is('image_high_url', null)
  console.log(`Cards without image: ${noImage ?? 0}`)

  const { data: lastJob } = await db
    .from('sync_jobs')
    .select('finished_at, status')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastJob?.finished_at) {
    console.log(`\nLast sync: ${new Date(lastJob.finished_at).toLocaleString('pt-BR')}`)
  }

  const healthy = checks.every(([, ok]) => ok) && (lastJob?.status === 'completed' || cards > 0)
  console.log(`\nStatus: ${healthy ? 'HEALTHY' : 'NEEDS ATTENTION'}`)
  process.exit(healthy ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
