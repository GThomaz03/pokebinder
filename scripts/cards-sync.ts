#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/** Incremental sync — skips completed set checkpoints. */
import { createSupabaseAdmin } from '../src/lib/supabaseAdmin'
import { SyncManager } from '../src/ingestion/jobs/syncManager'
import { createImportSources } from '../src/ingestion/sources/pokemonTcg/githubSource'

async function main() {
  console.log('Pokemon TCG — incremental sync\n')
  const importSources = await createImportSources()
  console.log(`Fonte: ${importSources.dataSourceName}\n`)

  const db = createSupabaseAdmin()
  const { data: src } = await db
    .from('data_sources')
    .select('id')
    .eq('name', importSources.dataSourceName)
    .single()

  const manager = new SyncManager(db, src?.id ?? null, {
    source: importSources.primary,
    translationSources: importSources.translations,
    checkpointSource: importSources.checkpointSource,
    dataSourceName: importSources.dataSourceName,
    cardSource: importSources.dataSourceName,
  })

  const stats = await manager.runIncremental({
    langs: importSources.translations.length ? ['en', 'pt'] : ['en'],
  })
  console.log('\nSync complete:', stats)
  process.exit(stats.failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
