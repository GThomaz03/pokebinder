import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardDataSource, SyncJobStats } from '../types'
import { normalizeTcgdexCard } from '../normalizers/tcgdexNormalizer'
import { CatalogWriter } from '../repository/catalogWriter'
import { CheckpointManager, SyncJobLogger } from './checkpoint'

export type ImportOptions = {
  setIds?: string[]
  serieIds?: string[]
  limitSets?: number
  langs?: Array<'en' | 'pt' | 'ja'>
  skipCompleted?: boolean
  full?: boolean
}

export type SyncManagerConfig = {
  source: CardDataSource
  translationSources?: CardDataSource[]
  checkpointSource?: string
  dataSourceName?: string
  cardSource?: string
}

export class SyncManager {
  private db: SupabaseClient
  private sourceId: string | null
  private writer: CatalogWriter
  private checkpoint: CheckpointManager
  private source: CardDataSource
  private translationSources: CardDataSource[]
  private dataSourceName: string
  private cardSource: string

  constructor(db: SupabaseClient, sourceId: string | null, config: SyncManagerConfig) {
    this.db = db
    this.sourceId = sourceId
    this.writer = new CatalogWriter(db)
    this.source = config.source
    this.translationSources = config.translationSources ?? []
    this.checkpoint = new CheckpointManager(db, config.checkpointSource ?? config.source.name)
    this.dataSourceName = config.dataSourceName ?? config.source.name
    this.cardSource = config.cardSource ?? config.source.name
  }

  async runImport(opts: ImportOptions = {}): Promise<SyncJobStats> {
    const logger = new SyncJobLogger(this.db, this.sourceId, opts.full ? 'full_import' : 'import')
    await logger.start(opts as Record<string, unknown>)
    const stats: SyncJobStats = { found: 0, created: 0, updated: 0, skipped: 0, failed: 0 }

    try {
      await this.importSeriesAndSets(stats, opts)
      await this.importCards(stats, opts, logger)
      await this.db
        .from('data_sources')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('name', this.dataSourceName)
      await logger.finish(stats.failed ? 'partial' : 'completed', stats)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await logger.finish('failed', stats, msg)
      throw err
    }
    return stats
  }

  async runIncremental(opts: ImportOptions = {}): Promise<SyncJobStats> {
    return this.runImport({ ...opts, skipCompleted: true, full: false })
  }

  private async importSeriesAndSets(stats: SyncJobStats, opts: ImportOptions) {
    const series = await this.source.getSeries()
    for (const s of series) {
      if (opts.serieIds?.length && !opts.serieIds.includes(s.id)) continue
      await this.writer.upsertSeries({
        sourceId: s.id,
        name: s.name,
        slug: s.id,
        logoUrl: s.logo,
        releaseDate: s.releaseDate,
      })
    }

    let sets = await this.source.getSets()
    if (opts.setIds?.length) {
      sets = sets.filter((s) => opts.setIds!.includes(s.id))
    }
    if (opts.serieIds?.length) {
      sets = sets.filter((s) => s.serieId && opts.serieIds!.includes(s.serieId))
    }
    if (opts.limitSets) sets = sets.slice(0, opts.limitSets)

    for (const s of sets) {
      let seriesUuid: string | null = null
      if (s.serieId) {
        seriesUuid = await this.writer.upsertSeries({
          sourceId: s.serieId,
          name: s.serieName ?? s.serieId,
          slug: s.serieId,
        })
      }

      let ptName: string | undefined
      const ptSource = this.translationSources.find((src) => 'lang' in src && (src as { lang?: string }).lang === 'pt')
      if (ptSource) {
        try {
          const ptSets = await ptSource.getSets()
          ptName = ptSets.find((x) => x.id === s.id)?.name
        } catch {
          /* optional */
        }
      }

      await this.writer.upsertSet({
        sourceId: s.id,
        name: s.name,
        slug: s.id,
        seriesId: seriesUuid,
        enName: s.name,
        ptName,
        releaseDate: s.releaseDate,
        logoUrl: s.logo,
        symbolUrl: s.symbol,
        totalCards: s.cardCount?.total,
        officialTotal: s.cardCount?.official,
        serieSlug: s.serieId,
      })

      await this.checkpoint.mark('set', s.id, 'pending', { name: s.name })
      stats.found++
    }
  }

  private cardLang(src: CardDataSource): string {
    return 'lang' in src ? String((src as { lang?: string }).lang ?? 'en') : 'en'
  }

  private async importCards(
    stats: SyncJobStats,
    opts: ImportOptions,
    logger: SyncJobLogger,
  ) {
    const cardSources =
      this.translationSources.length > 0 ? this.translationSources : [this.source]
    let sets = await this.source.getSets()
    if (opts.setIds?.length) sets = sets.filter((s) => opts.setIds!.includes(s.id))
    if (opts.serieIds?.length) sets = sets.filter((s) => s.serieId && opts.serieIds!.includes(s.serieId))
    if (opts.limitSets) sets = sets.slice(0, opts.limitSets)

    for (const set of sets) {
      if (opts.skipCompleted && (await this.checkpoint.isDone('set', set.id))) {
        stats.skipped++
        continue
      }

      let summaries: Awaited<ReturnType<CardDataSource['getCards']>> = []
      try {
        summaries = await this.source.getCards(set.id)
      } catch (err) {
        stats.failed++
        await logger.logError({
          source: this.source.name,
          externalId: set.id,
          endpoint: `/sets/${set.id}`,
          errorType: 'fetch_set',
          message: err instanceof Error ? err.message : String(err),
        })
        await this.checkpoint.mark('set', set.id, 'failed')
        continue
      }

      if (!summaries.length) {
        await this.checkpoint.mark('set', set.id, 'completed', { imported: 0, empty: true })
        continue
      }

      let imported = 0
      for (const summary of summaries) {
        try {
          const byLang = new Map<string, ReturnType<typeof normalizeTcgdexCard>>()
          for (const src of cardSources) {
            const lang = this.cardLang(src)
            const full = await src.getCard(summary.id, lang)
            if (!full) continue
            const norm = normalizeTcgdexCard(full, lang, set.id, this.cardSource)
            const prev = byLang.get(norm.canonicalId)
            if (prev) {
              prev.translations = [...prev.translations, ...norm.translations]
            } else {
              byLang.set(norm.canonicalId, norm)
            }
          }

          for (const norm of byLang.values()) {
            const { created } = await this.writer.upsertCard(norm)
            if (created) stats.created++
            else stats.updated++
            imported++
          }
        } catch (err) {
          stats.failed++
          await logger.logError({
            source: this.source.name,
            externalId: summary.id,
            endpoint: `/cards/${summary.id}`,
            errorType: 'upsert_card',
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      await this.writer.updateSetCoverage(
        set.id,
        set.cardCount?.official ?? set.cardCount?.total ?? summaries.length,
        imported,
      )
      await this.checkpoint.mark('set', set.id, 'completed', { imported })
      stats.found += summaries.length
    }
  }
}
