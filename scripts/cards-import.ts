#!/usr/bin/env node
import { loadEnvFile } from './loadEnv'
loadEnvFile()
/**
 * Initial / resume catalog import.
 * Usage: npm run cards:import [-- --set=base1 --limit=1 --source=github]
 */
import { createSupabaseAdmin } from '../src/lib/supabaseAdmin'
import { SyncManager } from '../src/ingestion/jobs/syncManager'
import { createImportSources } from '../src/ingestion/sources/pokemonTcg/githubSource'

function parseArgs() {
  const args = process.argv.slice(2)
  const opts: {
    setIds?: string[]
    serieIds?: string[]
    limitSets?: number
    full?: boolean
    source?: string
  } = {}
  for (const a of args) {
    if (a.startsWith('--set=')) opts.setIds = [a.slice(6)]
    else if (a.startsWith('--serie=')) opts.serieIds = [a.slice(8)]
    else if (a.startsWith('--limit=')) opts.limitSets = Number(a.slice(8))
    else if (a.startsWith('--source=')) opts.source = a.slice(9)
    else if (a === '--full') opts.full = true
  }
  return opts
}

async function main() {
  console.log('Pokemon TCG — catalog import\n')
  const cliOpts = parseArgs()
  if (cliOpts.source) process.env.CATALOG_IMPORT_SOURCE = cliOpts.source

  const importSources = await createImportSources()
  console.log(`Fonte: ${importSources.dataSourceName}\n`)

  const db = createSupabaseAdmin()
  const { data: src } = await db
    .from('data_sources')
    .select('id')
    .eq('name', importSources.dataSourceName)
    .single()

  const { setIds, serieIds, limitSets, full } = cliOpts
  const manager = new SyncManager(db, src?.id ?? null, {
    source: importSources.primary,
    translationSources: importSources.translations,
    checkpointSource: importSources.checkpointSource,
    dataSourceName: importSources.dataSourceName,
    cardSource: importSources.dataSourceName,
  })

  const stats = await manager.runImport({
    setIds,
    serieIds,
    limitSets,
    langs: importSources.translations.length ? ['en', 'pt'] : ['en'],
    skipCompleted: !full,
  })

  console.log('\nImport complete:')
  console.log(`  Found:   ${stats.found}`)
  console.log(`  Created: ${stats.created}`)
  console.log(`  Updated: ${stats.updated}`)
  console.log(`  Skipped: ${stats.skipped}`)
  console.log(`  Failed:  ${stats.failed}`)
  process.exit(stats.failed ? 1 : 0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
