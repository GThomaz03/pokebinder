import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedCatalogCard } from '../types'
import { validateNormalizedCard } from '../normalizers/tcgdexNormalizer'

export class CatalogWriter {
  private db: SupabaseClient
  private seriesCache = new Map<string, string>()
  private setCache = new Map<string, string>()
  private cardCache = new Map<string, string>()

  constructor(db: SupabaseClient) {
    this.db = db
  }

  async upsertSeries(row: {
    sourceId: string
    name: string
    slug: string
    language?: string
    logoUrl?: string
    releaseDate?: string
  }) {
    const key = `tcgdex:${row.sourceId}`
    if (this.seriesCache.has(key)) return this.seriesCache.get(key)!

    const { data, error } = await this.db
      .from('series')
      .upsert(
        {
          source: 'tcgdex',
          source_id: row.sourceId,
          name: row.name,
          slug: row.slug,
          language: row.language ?? 'en',
          logo_url: row.logoUrl ?? null,
          release_date: row.releaseDate ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source,source_id' },
      )
      .select('id')
      .single()
    if (error) throw error
    this.seriesCache.set(key, data.id)
    return data.id as string
  }

  async upsertSet(row: {
    sourceId: string
    name: string
    slug: string
    seriesId?: string | null
    ptName?: string
    enName?: string
    jpName?: string
    releaseDate?: string
    symbolUrl?: string
    logoUrl?: string
    totalCards?: number
    printedTotal?: number
    officialTotal?: number
    serieSlug?: string
  }) {
    const key = `tcgdex:${row.sourceId}`
    if (this.setCache.has(key)) return this.setCache.get(key)!

    const { data, error } = await this.db
      .from('sets')
      .upsert(
        {
          source: 'tcgdex',
          source_id: row.sourceId,
          series_id: row.seriesId ?? null,
          name: row.name,
          slug: row.slug,
          pt_name: row.ptName ?? null,
          en_name: row.enName ?? row.name,
          jp_name: row.jpName ?? null,
          release_date: row.releaseDate ?? null,
          symbol_url: row.symbolUrl ?? null,
          logo_url: row.logoUrl ?? null,
          total_cards: row.totalCards ?? null,
          printed_total: row.printedTotal ?? null,
          official_total: row.officialTotal ?? null,
          serie_slug: row.serieSlug ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'source,source_id' },
      )
      .select('id')
      .single()
    if (error) throw error
    this.setCache.set(key, data.id)
    return data.id as string
  }

  async upsertCard(card: NormalizedCatalogCard): Promise<{ id: string; created: boolean }> {
    const errors = validateNormalizedCard(card)
    if (errors.length) throw new Error(`Invalid card ${card.canonicalId}: ${errors.join(', ')}`)

    const setUuid = await this.ensureSet(card.setSourceId)
    const { data: existing } = await this.db
      .from('cards')
      .select('id')
      .eq('canonical_id', card.canonicalId)
      .maybeSingle()

    const row = {
      canonical_id: card.canonicalId,
      name: card.name,
      supertype: card.category ?? null,
      subtypes: card.stage ? [card.stage] : [],
      hp: card.hp ?? null,
      types: card.types,
      evolves_from: null,
      evolves_to: [],
      rules: [],
      rarity: card.rarity ?? null,
      artist: card.artist ?? null,
      flavor_text: card.effect ?? null,
      national_pokedex_numbers: card.dexIds,
      number: card.number,
      printed_number: card.printedNumber ?? card.number,
      set_id: setUuid,
      image_url: card.imageBase ?? null,
      image_high_url: card.imageHigh ?? null,
      image_low_url: card.imageLow ?? null,
      legalities: card.legalities,
      regulation_mark: card.regulationMark ?? null,
      language: card.language,
      category: card.category ?? null,
      stage: card.stage ?? null,
      trainer_type: card.trainerType ?? null,
      energy_type: card.energyType ?? null,
      effect: card.effect ?? null,
      source: card.source,
      source_id: card.sourceId,
      raw_data: card.rawData,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await this.db
      .from('cards')
      .upsert(row, { onConflict: 'canonical_id' })
      .select('id')
      .single()
    if (error) throw error

    const cardId = data.id as string
    this.cardCache.set(card.canonicalId, cardId)

    await this.replaceRelated(cardId, card)
    await this.db.from('card_identifiers').upsert(
      {
        card_id: cardId,
        source: 'tcgdex',
        external_id: card.sourceId,
        external_url: `https://api.tcgdex.net/v2/en/cards/${card.sourceId}`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'source,external_id' },
    )

    return { id: cardId, created: !existing }
  }

  private async ensureSet(setSourceId: string): Promise<string | null> {
    const key = `tcgdex:${setSourceId}`
    if (this.setCache.has(key)) return this.setCache.get(key)!
    const { data } = await this.db
      .from('sets')
      .select('id')
      .eq('source', 'tcgdex')
      .eq('source_id', setSourceId)
      .maybeSingle()
    if (data?.id) {
      this.setCache.set(key, data.id)
      return data.id
    }
    return null
  }

  private async replaceRelated(cardId: string, card: NormalizedCatalogCard) {
    await Promise.all([
      this.db.from('card_attacks').delete().eq('card_id', cardId),
      this.db.from('card_weaknesses').delete().eq('card_id', cardId),
      this.db.from('card_resistances').delete().eq('card_id', cardId),
      this.db.from('card_rules').delete().eq('card_id', cardId),
    ])

    if (card.attacks.length) {
      await this.db.from('card_attacks').insert(
        card.attacks.map((a) => ({
          card_id: cardId,
          name: a.name,
          cost: a.cost,
          damage: a.damage ?? null,
          text: a.text ?? null,
          attack_order: a.order,
        })),
      )
    }
    if (card.weaknesses.length) {
      await this.db.from('card_weaknesses').insert(
        card.weaknesses.map((w) => ({ card_id: cardId, type: w.type, value: w.value })),
      )
    }
    if (card.resistances.length) {
      await this.db.from('card_resistances').insert(
        card.resistances.map((r) => ({ card_id: cardId, type: r.type, value: r.value })),
      )
    }
    if (card.rules.length) {
      await this.db.from('card_rules').insert(
        card.rules.map((r) => ({
          card_id: cardId,
          rule_type: r.ruleType,
          text: r.text,
          rule_order: r.order,
        })),
      )
    }

    for (const v of card.variants) {
      await this.db.from('card_variants').upsert(
        {
          card_id: cardId,
          variant_type: v.variantType,
          is_holo: v.isHolo,
          is_reverse_holo: v.isReverseHolo,
          is_first_edition: v.isFirstEdition,
          is_shadowless: v.isShadowless,
          is_promo: v.isPromo,
          language: card.language,
          source: card.source,
          source_id: v.sourceId ?? `${card.sourceId}::${v.variantType}`,
          image_url: card.imageHigh ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,variant_type,language,source_id', ignoreDuplicates: false },
      )
    }

    for (const t of card.translations) {
      await this.db.from('card_translations').upsert(
        {
          card_id: cardId,
          language: t.language,
          name: t.name,
          flavor_text: t.flavorText ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,language' },
      )
    }

    for (const p of card.prices) {
      await this.db.from('card_prices').upsert(
        {
          card_id: cardId,
          source: 'tcgdex',
          market: p.market,
          low: p.low ?? null,
          mid: p.mid ?? null,
          high: p.high ?? null,
          currency: p.currency,
          variant: p.variant ?? null,
          observed_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,source,market,variant,condition', ignoreDuplicates: false },
      )
    }

    if (card.imageHigh) {
      await this.db.from('card_images').upsert(
        {
          card_id: cardId,
          source: 'tcgdex',
          original_url: card.imageHigh,
          quality: 'high',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,variant_id,quality', ignoreDuplicates: false },
      )
    }
  }

  async updateSetCoverage(setSourceId: string, expected: number, imported: number) {
    const setId = await this.ensureSet(setSourceId)
    if (!setId) return
    await this.db.from('set_coverage').upsert(
      {
        set_id: setId,
        expected_cards: expected,
        imported_cards: imported,
        missing_cards: Math.max(0, expected - imported),
        last_checked_at: new Date().toISOString(),
      },
      { onConflict: 'set_id' },
    )
  }
}
