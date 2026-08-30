import type { SupabaseClient } from '@supabase/supabase-js'
import type { PricingBlock } from '../../api/prices/pricingExtract'

export type CatalogPriceRow = {
  market: string
  low?: number
  mid?: number
  high?: number
  currency: string
  variant?: string
}

export async function upsertCardPrices(
  db: SupabaseClient,
  cardUuid: string,
  prices: CatalogPriceRow[],
  source: string,
  pricingBlock?: PricingBlock,
): Promise<void> {
  const observedAt = new Date().toISOString()
  const variant = (v?: string) => v ?? 'normal'

  for (const p of prices) {
    const v = variant(p.variant)
    const { error: delErr } = await db
      .from('card_prices')
      .delete()
      .eq('card_id', cardUuid)
      .eq('source', source)
      .eq('market', p.market)
      .eq('variant', v)
    if (delErr) throw delErr

    const { error: insErr } = await db.from('card_prices').insert({
      card_id: cardUuid,
      source,
      market: p.market,
      low: p.low ?? null,
      mid: p.mid ?? null,
      high: p.high ?? null,
      currency: p.currency,
      variant: v,
      condition: null,
      observed_at: observedAt,
    })
    if (insErr) throw insErr
  }

  if (!pricingBlock) return

  const { data, error: readErr } = await db
    .from('cards')
    .select('raw_data')
    .eq('id', cardUuid)
    .maybeSingle()
  if (readErr) throw readErr

  const raw =
    data?.raw_data && typeof data.raw_data === 'object'
      ? (data.raw_data as Record<string, unknown>)
      : {}
  const { error: writeErr } = await db
    .from('cards')
    .update({
      raw_data: { ...raw, pricing: pricingBlock },
      updated_at: observedAt,
    })
    .eq('id', cardUuid)
  if (writeErr) throw writeErr
}
