#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()

import { createSupabaseAdmin } from '../src/lib/supabaseAdmin'
import { CheckpointManager, SyncJobLogger } from '../src/ingestion/jobs/checkpoint'
import { upsertCardPrices } from '../src/ingestion/repository/priceWriter'
import {
  catalogPricesFromPokemonTcg,
  fetchPokemonTcgSetCards,
  pricingFromPokemonTcgCard,
} from '../src/api/prices/pokemonTcgPricing'

const SOURCE = 'pokemontcg-prices'
const PRICE_SOURCE = 'pokemontcg'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function rateLimitMs() {
  return process.env.POKEMON_TCG_API_KEY?.trim() ? 500 : 2000
}

function parseArgs() {
  const onlySet = process.argv.find((a) => a.startsWith('--set='))?.slice(6)
  const force = process.argv.includes('--force')
  return { onlySet, force }
}

async function loadSetIds(db: ReturnType<typeof createSupabaseAdmin>, onlySet?: string) {
  if (onlySet) return [onlySet]
  const { data, error } = await db.from('sets').select('source_id').order('release_date', {
    ascending: false,
    nullsFirst: false,
  })
  if (error) throw error
  return [...new Set((data ?? []).map((r) => r.source_id as string).filter(Boolean))]
}

async function loadCardUuidMap(
  db: ReturnType<typeof createSupabaseAdmin>,
  canonicalIds: string[],
) {
  const map = new Map<string, string>()
  const chunk = 200
  for (let i = 0; i < canonicalIds.length; i += chunk) {
    const slice = canonicalIds.slice(i, i + chunk)
    const { data } = await db.from('cards').select('id, canonical_id').in('canonical_id', slice)
    for (const row of data ?? []) {
      map.set(row.canonical_id, row.id)
    }
  }
  return map
}

async function syncSetPrices(
  db: ReturnType<typeof createSupabaseAdmin>,
  setId: string,
  logger: SyncJobLogger,
) {
  let page = 1
  let updated = 0
  let skipped = 0
  let failed = 0

  while (true) {
    const res = await fetchPokemonTcgSetCards(setId, page)
    const cards = res.data ?? []
    if (!cards.length) break

    const uuidMap = await loadCardUuidMap(
      db,
      cards.map((c) => c.id).filter(Boolean),
    )

    for (const card of cards) {
      const pricing = pricingFromPokemonTcgCard(card)
      const rows = catalogPricesFromPokemonTcg(card)
      if (!rows.length) {
        skipped++
        continue
      }

      const cardUuid = uuidMap.get(card.id)
      if (!cardUuid) {
        skipped++
        continue
      }

      try {
        await upsertCardPrices(db, cardUuid, rows, PRICE_SOURCE, pricing)
        updated++
      } catch (err) {
        failed++
        await logger.logError({
          source: PRICE_SOURCE,
          externalId: card.id,
          endpoint: `set.id:${setId}`,
          errorType: 'upsert',
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }

    const totalPages = res.totalCount && res.pageSize ? Math.ceil(res.totalCount / res.pageSize) : page
    if (page >= totalPages || cards.length < (res.pageSize ?? 250)) break
    page++
    await sleep(rateLimitMs())
  }

  return { updated, skipped, failed }
}

async function main() {
  const { onlySet, force } = parseArgs()
  console.log('Pokémon TCG — price sync\n')

  const db = createSupabaseAdmin()
  const { data: srcRow } = await db
    .from('data_sources')
    .select('id')
    .eq('name', 'pokemon_tcg_api')
    .maybeSingle()

  const logger = new SyncJobLogger(db, srcRow?.id ?? null, 'price_sync')
  await logger.start({ onlySet: onlySet ?? null, force })

  const checkpoints = new CheckpointManager(db, SOURCE)
  const setIds = await loadSetIds(db, onlySet)
  console.log(`Sets to process: ${setIds.length}\n`)

  let totalUpdated = 0
  let totalSkipped = 0
  let totalFailed = 0
  let setsDone = 0

  for (const setId of setIds) {
    if (!force && (await checkpoints.isDone('set', setId))) {
      console.log(`  skip ${setId} (checkpoint)`)
      setsDone++
      continue
    }

    process.stdout.write(`  sync ${setId}… `)
    try {
      const stats = await syncSetPrices(db, setId, logger)
      totalUpdated += stats.updated
      totalSkipped += stats.skipped
      totalFailed += stats.failed
      await checkpoints.mark('set', setId, 'completed', stats)
      console.log(`ok (+${stats.updated}, skip ${stats.skipped}, fail ${stats.failed})`)
      setsDone++
    } catch (err) {
      totalFailed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`FAIL: ${msg}`)
      await checkpoints.mark('set', setId, 'failed', { error: msg })
      await logger.logError({
        source: PRICE_SOURCE,
        externalId: setId,
        endpoint: `set.id:${setId}`,
        errorType: 'fetch',
        message: msg,
      })
    }

    await sleep(rateLimitMs())
  }

  const status = totalFailed && setsDone < setIds.length ? 'partial' : 'completed'
  await logger.finish(
    status,
    {
      found: setIds.length,
      created: 0,
      updated: totalUpdated,
      skipped: totalSkipped,
      failed: totalFailed,
    },
    totalFailed ? `${totalFailed} failures` : undefined,
  )

  console.log('\nPrice sync complete:', {
    sets: setIds.length,
    updated: totalUpdated,
    skipped: totalSkipped,
    failed: totalFailed,
  })
  process.exit(totalFailed && !totalUpdated ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
