import type { SupabaseClient } from '@supabase/supabase-js'
import type { CardDataSource, ExternalCardSummary, ExternalSet, SyncJobStats } from '../types'
import { CONTENT_LANG_PRIORITY, mergeCardByLanguagePriority } from '../languagePriority'
import { canonicalBelongsToSet } from '../../api/cards/catalogQuery'
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

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const message = (err as { message: unknown }).message
    if (typeof message === 'string' && message) return message
    if (message != null) {
      try {
        return JSON.stringify(message)
      } catch {
        return String(message)
      }
    }
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
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
      const msg = errorMessage(err)
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

    let sets = await this.collectAllSets(opts)

    const localizedSetNames = new Map<string, Map<string, string>>()
    for (const src of this.translationSources) {
      const lang = this.cardLang(src)
      if (lang !== 'pt' && lang !== 'ja') continue
      try {
        const rows = await src.getSets()
        localizedSetNames.set(lang, new Map(rows.map((row) => [row.id, row.name])))
      } catch {
        /* optional */
      }
    }

    for (const s of sets) {
      let seriesUuid: string | null = null
      if (s.serieId) {
        seriesUuid = await this.writer.upsertSeries({
          sourceId: s.serieId,
          name: s.serieName ?? s.serieId,
          slug: s.serieId,
        })
      }

      const ptName = localizedSetNames.get('pt')?.get(s.id)
      const jpName = localizedSetNames.get('ja')?.get(s.id)

      await this.writer.upsertSet({
        sourceId: s.id,
        name: ptName ?? s.name,
        slug: s.id,
        seriesId: seriesUuid,
        enName: s.name,
        ptName,
        jpName,
        releaseDate: s.releaseDate,
        logoUrl: s.logo,
        symbolUrl: s.symbol,
        totalCards: s.cardCount?.total,
        officialTotal: s.cardCount?.official,
        serieSlug: s.serieId,
      })

      // Incremental sync must not wipe completed checkpoints — allows resume after interruption.
      const done = await this.checkpoint.isDone('set', s.id)
      if (!opts.skipCompleted || !done) {
        await this.checkpoint.mark('set', s.id, 'pending', { name: s.name })
      }
      stats.found++
    }
  }

  private cardLang(src: CardDataSource): string {
    return 'lang' in src ? String((src as { lang?: string }).lang ?? 'en') : 'en'
  }

  private langSources(): Map<string, CardDataSource> {
    const map = new Map<string, CardDataSource>()
    for (const src of [this.source, ...this.translationSources]) {
      const lang = this.cardLang(src)
      if (!map.has(lang)) map.set(lang, src)
    }
    return map
  }

  /** Union of card ids across pt/en/ja. Ids must match the set's case (`SV10` ≠ `sv10`). */
  private async getSetSummaries(setId: string): Promise<ExternalCardSummary[]> {
    const sources = this.langSources()
    const byId = new Map<string, ExternalCardSummary>()
    for (const lang of CONTENT_LANG_PRIORITY) {
      const src = sources.get(lang)
      if (!src) continue
      try {
        const summaries = await src.getCards(setId)
        for (const summary of summaries) {
          if (!canonicalBelongsToSet(summary.id, setId)) continue
          if (!byId.has(summary.id)) byId.set(summary.id, summary)
        }
      } catch {
        /* optional lang */
      }
    }
    return [...byId.values()]
  }

  /** Merge set metadata from EN + PT + JA catalogs (JA-only sets included). */
  private async collectAllSets(opts: ImportOptions): Promise<ExternalSet[]> {
    const byId = new Map<string, ExternalSet>()
    for (const src of [this.source, ...this.translationSources]) {
      let rows = await src.getSets()
      if (opts.setIds?.length) rows = rows.filter((s) => opts.setIds!.includes(s.id))
      if (opts.serieIds?.length) {
        rows = rows.filter((s) => s.serieId && opts.serieIds!.includes(s.serieId))
      }
      for (const s of rows) {
        const prev = byId.get(s.id)
        if (!prev) {
          byId.set(s.id, s)
          continue
        }
        byId.set(s.id, {
          ...prev,
          name: prev.name || s.name,
          cardCount: {
            total: Math.max(prev.cardCount?.total ?? 0, s.cardCount?.total ?? 0),
            official: Math.max(prev.cardCount?.official ?? 0, s.cardCount?.official ?? 0),
          },
          serieId: prev.serieId ?? s.serieId,
          serieName: prev.serieName ?? s.serieName,
        })
      }
    }
    let sets = [...byId.values()]
    if (opts.limitSets) sets = sets.slice(0, opts.limitSets)
    return sets
  }

  private async importCards(
    stats: SyncJobStats,
    opts: ImportOptions,
    logger: SyncJobLogger,
  ) {
    const cardSources = this.langSources()
    const sets = await this.collectAllSets(opts)

    for (const set of sets) {
      if (opts.skipCompleted && (await this.checkpoint.isDone('set', set.id))) {
        stats.skipped++
        continue
      }

      let summaries: ExternalCardSummary[] = []
      try {
        summaries = await this.getSetSummaries(set.id)
      } catch (err) {
        stats.failed++
        await logger.logError({
          source: this.source.name,
          externalId: set.id,
          endpoint: `/sets/${set.id}`,
          errorType: 'fetch_set',
          message: errorMessage(err),
        })
        await this.checkpoint.mark('set', set.id, 'failed')
        continue
      }

      if (!summaries.length) {
        const expected = set.cardCount?.total ?? 0
        if (expected > 0) {
          stats.failed++
          await logger.logError({
            source: this.source.name,
            externalId: set.id,
            endpoint: `/sets/${set.id}`,
            errorType: 'empty_set',
            message: `Set ${set.id} anunciou ${expected} cartas, mas nenhuma foi obtida`,
          })
          await this.checkpoint.mark('set', set.id, 'failed', { imported: 0, expected })
        } else {
          await this.checkpoint.mark('set', set.id, 'completed', { imported: 0, empty: true })
        }
        continue
      }

      let imported = 0
      for (const summary of summaries) {
        try {
          const byLang = new Map<string, ReturnType<typeof normalizeTcgdexCard>>()
          for (const lang of CONTENT_LANG_PRIORITY) {
            const src = cardSources.get(lang)
            if (!src) continue
            const full = await src.getCard(summary.id, lang)
            if (!full) continue
            const normalized = normalizeTcgdexCard(full, lang, set.id, this.cardSource)
            // A case-insensitive API can answer SV10-001 with the English card sv10-001.
            if (!canonicalBelongsToSet(normalized.canonicalId, set.id)) continue
            byLang.set(lang, {
              ...normalized,
              canonicalId: summary.id,
              sourceId: summary.id,
              setSourceId: set.id,
            })
          }

          const norm = mergeCardByLanguagePriority(byLang)
          if (!norm) continue

          const { created } = await this.writer.upsertCard(norm)
          if (created) stats.created++
          else stats.updated++
          imported++
        } catch (err) {
          stats.failed++
          await logger.logError({
            source: this.source.name,
            externalId: summary.id,
            endpoint: `/cards/${summary.id}`,
            errorType: 'upsert_card',
            message: errorMessage(err),
          })
        }
      }

      await this.writer.updateSetCoverage(set.id, summaries.length, imported)
      const status = imported === summaries.length ? 'completed' : 'failed'
      await this.checkpoint.mark('set', set.id, status, { imported, expected: summaries.length })
      stats.found += summaries.length
    }
  }
}
