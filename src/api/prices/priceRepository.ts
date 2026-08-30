import type { CachedCard, CardLang, CardPrice, PriceMarket } from '../../types'
import { API_CONFIG } from '../config'
import { cardImageUrl, inferMissingImageCandidates, isLegacyCatalogImage } from '../images/imageProvider'
import { getCachedFxRates, getFxRates, toBrl } from '../fx/fxProvider'
import { baseCardId, catalogCardIdCandidates, parseOwnedKey } from '../cardKeys'
import { createTcgdexPriceProvider, quoteFromPricing, extractMarkets } from './tcgdexPriceProvider'
import { pokemonTcgPriceProvider } from './pokemonTcgPriceProvider'
import type { PriceProvider, PriceQuote, PriceQuoteOptions } from './types'
import { getCardById } from '../cards/cardRepository'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'

const tcgdexPriceProvider = createTcgdexPriceProvider(async (lang, cardId) => {
  const card = await getCardById(lang as CardLang, cardId)
  if (!card || !isSupabaseConfigured || !supabase) return undefined
  for (const cid of catalogCardIdCandidates(cardId)) {
    const { data } = await supabase
      .from('cards')
      .select('raw_data')
      .eq('canonical_id', cid)
      .maybeSingle()
    const rd = data?.raw_data as { pricing?: PriceQuoteOptions['pricingHint'] } | undefined
    if (rd?.pricing) return rd.pricing
  }
  return undefined
})

const providers: PriceProvider[] = [tcgdexPriceProvider, pokemonTcgPriceProvider]

/** Active price providers — Supabase/TCGdex first, then Pokémon TCG API live. */
export function getPriceProviders(): PriceProvider[] {
  return providers
}

export async function getPriceQuote(
  cardId: string,
  opts: PriceQuoteOptions = {},
): Promise<PriceQuote | null> {
  for (const provider of providers) {
    try {
      const quote = await provider.getQuote(cardId, opts)
      if (
        quote &&
        (quote.amount != null ||
          quote.markets.cardmarket != null ||
          quote.markets.tcgplayer != null)
      ) {
        return quote
      }
    } catch {
      /* try next provider */
    }
  }
  return null
}

export function quoteToLegacyPrice(quote: PriceQuote | null | undefined): CardPrice {
  if (!quote) return { updated: 0 }
  const hasValue = quote.markets.cardmarket != null || quote.markets.tcgplayer != null
  return {
    eur: quote.markets.cardmarket,
    usd: quote.markets.tcgplayer,
    updated: hasValue ? quote.updatedAt : 0,
  }
}

export function legacyPriceToPartialQuote(
  cardId: string,
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): PriceQuote | null {
  if (!price?.updated) return null
  const fx = getCachedFxRates()
  const preferEur = market === 'cardmarket'
  const amount = preferEur ? (price.eur ?? price.usd) : (price.usd ?? price.eur)
  const currency: 'EUR' | 'USD' =
    preferEur
      ? price.eur != null
        ? 'EUR'
        : 'USD'
      : price.usd != null
        ? 'USD'
        : 'EUR'
  const convertedAmount = amount != null ? toBrl(amount, currency, fx) : null
  return {
    cardId: baseCardId(cardId),
    source: 'tcgdex',
    amount: amount ?? null,
    currency,
    markets: { cardmarket: price.eur, tcgplayer: price.usd },
    fxRate: currency === 'EUR' ? fx.eurToBrl : fx.usdToBrl,
    fxFetchedAt: fx.updated || undefined,
    fxSource: fx.source,
    convertedAmount,
    convertedCurrency: 'BRL',
    estimated: true,
    updatedAt: price.updated,
  }
}

function amountInBrl(
  price: CardPrice,
  market: PriceMarket,
  fx: { eurToBrl: number; usdToBrl: number },
): number | null {
  return (
    market === 'cardmarket'
      ? toBrl(price.eur, 'EUR', fx) ?? toBrl(price.usd, 'USD', fx)
      : toBrl(price.usd, 'USD', fx) ?? toBrl(price.eur, 'EUR', fx)
  ) ?? null
}

/** Numeric BRL estimate using last known FX (or fallback). */
export function priceToBrl(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): number | null {
  if (!price) return null
  return amountInBrl(price, market, getCachedFxRates())
}

export function formatEstimatedBrl(
  amount: number | null | undefined,
): string | null {
  if (amount == null) return null
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Sync formatter — estimated BRL from FX conversion. */
export function formatPrice(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): string | null {
  return formatEstimatedBrl(priceToBrl(price, market))
}

export async function formatPriceBrl(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): Promise<string | null> {
  if (!price) return null
  const fx = await getFxRates()
  return formatEstimatedBrl(amountInBrl(price, market, fx))
}

export const ESTIMATED_BRL_LABEL = 'Preço estimado (BRL)'
export const ESTIMATED_BRL_HINT =
  'Valor convertido de EUR/USD pelo câmbio — não é o preço praticado no Brasil.'

// --- Legacy cache bridge (still used until all UI migrates to React Query) ---

const PRICE_KEY = API_CONFIG.storageKeys.pricesLegacy
const CARD_KEY = API_CONFIG.storageKeys.cardsLegacy

type PriceMap = Record<string, CardPrice>
type CardMap = Record<string, CachedCard>

function isStubCardEntry(id: string, card: CachedCard): boolean {
  const base = baseCardId(id)
  return !card.name || card.name === id || card.name === base
}

/** Drop legacy stubs and broken image URLs so hydrate refetches from Supabase. */
function sanitizeCardCache(raw: CardMap): CardMap {
  const out: CardMap = {}
  for (const [id, card] of Object.entries(raw)) {
    if (isStubCardEntry(id, card)) continue
    if (isLegacyCatalogImage(card.image)) {
      out[id] = { ...card, image: undefined }
      continue
    }
    if (card.price?.updated && card.price.eur == null && card.price.usd == null) {
      out[id] = { ...card, price: { updated: 0 } }
      continue
    }
    out[id] = card
  }
  return out
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

let priceCache: PriceMap = loadJson(PRICE_KEY, {})
const loadedCards = loadJson(CARD_KEY, {})
let cardCache: CardMap = sanitizeCardCache(loadedCards)
if (JSON.stringify(loadedCards) !== JSON.stringify(cardCache)) {
  try {
    localStorage.setItem(CARD_KEY, JSON.stringify(cardCache))
  } catch {
    /* ignore */
  }
}

function persistPrices() {
  try {
    localStorage.setItem(PRICE_KEY, JSON.stringify(priceCache))
  } catch {
    /* ignore */
  }
}

function persistCards() {
  try {
    localStorage.setItem(CARD_KEY, JSON.stringify(cardCache))
  } catch {
    /* ignore */
  }
}

export function getCachedCard(id: string): CachedCard | undefined {
  return cardCache[baseCardId(id)] ?? cardCache[id]
}

export function getCachedPrice(id: string): CardPrice | undefined {
  return priceCache[id] ?? priceCache[baseCardId(id)] ?? getCachedCard(id)?.price
}

function hasPricingData(pricing?: PriceQuoteOptions['pricingHint']): boolean {
  if (!pricing) return false
  const markets = extractMarkets(pricing)
  return markets.cardmarket != null || markets.tcgplayer != null
}

function numPrice(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

function isResolvedCardImageUrl(url: string): boolean {
  if (/\.(webp|png|jpg|jpeg)(\?.*)?$/i.test(url)) return true
  if (/scrydex\.com\/pokemon\//i.test(url) && /\/(large|small)$/i.test(url)) return true
  if (/\/(high|low)\.(webp|png|jpg|jpeg)/i.test(url)) return true
  return false
}

export async function hydrateCard(
  lang: CardLang,
  id: string,
  force = false,
): Promise<CachedCard | null> {
  const parsed = parseOwnedKey(id)
  const cardId = parsed.cardId
  const fetchLang = parsed.lang ?? lang
  const existing = cardCache[cardId]
  const imageLooksRaw =
    Boolean(existing?.image) && !isResolvedCardImageUrl(existing!.image!)
  const looksLikeStub = Boolean(existing) && isStubCardEntry(cardId, existing!)
  const legacyImage = Boolean(existing?.image) && isLegacyCatalogImage(existing!.image)
  const priceMissing = !existing?.price?.eur && !existing?.price?.usd
  const stale =
    !existing ||
    !existing.image ||
    imageLooksRaw ||
    looksLikeStub ||
    legacyImage ||
    priceMissing ||
    force ||
    Date.now() - (existing?.price.updated || 0) > API_CONFIG.cache.priceStaleTimeMs

  if (existing && !stale && !force && !parsed.lang && existing.image) return existing

  try {
    const normalized = await getCardById(fetchLang, cardId)
    let raw: {
      id: string
      name?: string
      localId?: string | number
      image?: string
      set?: { id?: string; name?: string }
      illustrator?: string
      rarity?: string
      types?: string[]
      dexId?: number[]
      pricing?: PriceQuoteOptions['pricingHint']
    } | null = normalized

    if (normalized) {
      raw = {
        id: normalized.id,
        name: normalized.name,
        localId: normalized.localId,
        image: normalized.image ?? normalized.imageBase,
        set: { id: normalized.setId, name: normalized.setName },
        illustrator: normalized.illustrator,
        rarity: normalized.rarity,
        types: normalized.types,
        dexId: normalized.dexId,
      }
    }

    if (normalized && isSupabaseConfigured && supabase) {
      for (const cid of catalogCardIdCandidates(cardId)) {
        const { data: cardRow } = await supabase
          .from('cards')
          .select('id, raw_data')
          .eq('canonical_id', cid)
          .maybeSingle()
        if (!cardRow) continue
        if (cardRow.raw_data && typeof cardRow.raw_data === 'object') {
          const rd = cardRow.raw_data as { pricing?: PriceQuoteOptions['pricingHint'] }
          if (rd.pricing && hasPricingData(rd.pricing)) {
            raw = { ...raw!, pricing: rd.pricing }
            break
          }
        }
        const { data: prices } = await supabase
          .from('card_prices')
          .select('market, mid, low, high, currency')
          .eq('card_id', cardRow.id)
        if (prices?.length && raw) {
          const cm = prices.find((p) => p.market === 'cardmarket')
          const tcg = prices.find((p) => p.market === 'tcgplayer')
          raw.pricing = {
            cardmarket: cm
              ? {
                  avg: numPrice(cm.mid),
                  low: numPrice(cm.low),
                  trend: numPrice(cm.mid),
                }
              : undefined,
            tcgplayer: tcg
              ? {
                  normal: {
                    marketPrice: numPrice(tcg.mid),
                    lowPrice: numPrice(tcg.low),
                    highPrice: numPrice(tcg.high),
                  },
                }
              : undefined,
          } as PriceQuoteOptions['pricingHint']
          if (hasPricingData(raw.pricing)) break
        }
      }
    }

    if (!raw && fetchLang !== 'en') {
      const enNorm = await getCardById('en', cardId)
      if (enNorm) {
        raw = {
          id: enNorm.id,
          name: enNorm.name,
          localId: enNorm.localId,
          image: enNorm.imageBase ?? enNorm.image,
          set: { id: enNorm.setId, name: enNorm.setName },
          illustrator: enNorm.illustrator,
          rarity: enNorm.rarity,
          types: enNorm.types,
          dexId: enNorm.dexId,
        }
      }
    }
    if (!raw?.id) {
      const localId =
        existing?.localId ||
        (cardId.includes('-') ? cardId.slice(cardId.lastIndexOf('-') + 1) : '')
      const image =
        (existing?.image && !isLegacyCatalogImage(existing.image) ? existing.image : undefined) ||
        inferMissingImageCandidates({
          cardId,
          name: existing?.name,
          localId,
        }).find((u) => !isLegacyCatalogImage(u))
      if (!image && !existing) return null
      const stub: CachedCard = {
        id: cardId,
        name: existing?.name || cardId,
        localId: String(localId),
        image,
        setName: existing?.setName,
        setId:
          existing?.setId ??
          (cardId.includes('-') ? cardId.slice(0, cardId.lastIndexOf('-')) : undefined),
        illustrator: existing?.illustrator,
        rarity: existing?.rarity,
        types: existing?.types,
        dexId: existing?.dexId,
        price: existing?.price ?? { updated: 0 },
      }
      if (!existing) {
        cardCache = { ...cardCache, [cardId]: stub }
        persistCards()
      }
      return existing ?? stub
    }

    let image = cardImageUrl(raw.image, 'high')
    if (isLegacyCatalogImage(image)) image = undefined
    if (!image && fetchLang !== 'en') {
      const enNorm = await getCardById('en', cardId)
      image = cardImageUrl(enNorm?.imageBase ?? enNorm?.image, 'high')
      if (isLegacyCatalogImage(image)) image = undefined
    }
    if (!image) {
      image =
        inferMissingImageCandidates({
          cardId,
          name: raw.name || existing?.name,
          localId: raw.localId ?? existing?.localId,
        }).find((u) => !isLegacyCatalogImage(u)) ?? undefined
    }

    const quote = hasPricingData(raw.pricing)
      ? await quoteFromPricing(cardId, raw.pricing, {
          lang: fetchLang,
          market: 'cardmarket',
          source: 'pokemontcg',
        })
      : await getPriceQuote(cardId, {
          lang: fetchLang,
          market: 'cardmarket',
        })
    const price = quoteToLegacyPrice(quote)

    const cached: CachedCard = {
      id: String(raw.id),
      name: raw.name || existing?.name || cardId,
      localId: String(raw.localId ?? existing?.localId ?? ''),
      image,
      setName: raw.set?.name ?? existing?.setName,
      setId: raw.set?.id ?? existing?.setId,
      illustrator: raw.illustrator ?? existing?.illustrator,
      rarity: raw.rarity ?? existing?.rarity,
      types: raw.types ?? existing?.types,
      dexId: raw.dexId ?? existing?.dexId,
      price,
    }
    cardCache = { ...cardCache, [cardId]: cached }
    priceCache = { ...priceCache, [cardId]: price }
    persistCards()
    persistPrices()
    return cached
  } catch {
    return existing ?? null
  }
}

export function seedCardBrief(brief: {
  id: string
  name: string
  localId: string | number
  image?: string
  price?: CardPrice
  setId?: string
  setName?: string
  rarity?: string
  types?: string[]
}): CachedCard {
  const id = baseCardId(brief.id)
  const existing = cardCache[id]
  // TCGdex resumes return image bases without /high.webp — never persist those raw.
  const image = cardImageUrl(brief.image, 'high') ?? existing?.image
  const cached: CachedCard = {
    id,
    name: brief.name || existing?.name || id,
    localId: String(brief.localId ?? existing?.localId ?? ''),
    image,
    setId: brief.setId ?? existing?.setId,
    setName: brief.setName ?? existing?.setName,
    price: brief.price?.updated ? brief.price : existing?.price ?? { updated: 0 },
    illustrator: existing?.illustrator,
    rarity: brief.rarity ?? existing?.rarity,
    types: brief.types ?? existing?.types,
    dexId: existing?.dexId,
  }
  cardCache = { ...cardCache, [id]: cached }
  if (brief.price?.updated) {
    priceCache = { ...priceCache, [brief.id]: brief.price, [id]: brief.price }
    persistPrices()
  }
  persistCards()
  return cached
}

export function cacheVariantPrice(key: string, price: CardPrice) {
  priceCache = { ...priceCache, [key]: price }
  persistPrices()
}

// Re-export for callers that used prices.ts as the FX entry
export { getFxRates, quoteFromPricing }
