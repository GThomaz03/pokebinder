import type { CachedCard, CardLang, CardPrice, PriceMarket } from '../../types'
import { API_CONFIG } from '../config'
import { cardImageUrl, inferMissingImageCandidates } from '../images/imageProvider'
import { getCachedFxRates, getFxRates, toBrl } from '../fx/fxProvider'
import { baseCardId, parseOwnedKey } from '../cardKeys'
import { createTcgdexPriceProvider, quoteFromPricing } from './tcgdexPriceProvider'
import type { PriceProvider, PriceQuote, PriceQuoteOptions } from './types'
import { getCard } from '../tcgdex'

const tcgdexPriceProvider = createTcgdexPriceProvider(async (lang, cardId) => {
  const card = await getCard(lang as CardLang, cardId)
  return (card as { pricing?: PriceQuoteOptions['pricingHint'] } | undefined)?.pricing
})

const providers: PriceProvider[] = [tcgdexPriceProvider]

/** Active providers — today only TCGdex; more can be appended later. */
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
      if (quote) return quote
    } catch {
      /* try next provider */
    }
  }
  return null
}

export function quoteToLegacyPrice(quote: PriceQuote | null | undefined): CardPrice {
  if (!quote) return { updated: 0 }
  return {
    eur: quote.markets.cardmarket,
    usd: quote.markets.tcgplayer,
    updated: quote.updatedAt,
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
let cardCache: CardMap = loadJson(CARD_KEY, {})

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
    Boolean(existing?.image) &&
    !/\/(high|low)\.(webp|png|jpg|jpeg)/i.test(existing!.image!)
  const stale =
    !existing ||
    !existing.image ||
    imageLooksRaw ||
    force ||
    Date.now() - (existing.price.updated || 0) > API_CONFIG.cache.priceStaleTimeMs

  if (existing && !stale && !force && !parsed.lang && existing.image) return existing

  try {
    // Single REST fetch (avoids SDK localStorage quota crashes + double getCard for price)
    let raw = (await getCard(fetchLang, cardId)) as
      | {
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
        }
      | undefined
      | null

    if (!raw && fetchLang !== 'en') {
      raw = (await getCard('en', cardId)) as typeof raw
    }
    if (!raw?.id) return existing ?? null

    let image = cardImageUrl(raw.image, 'high')
    if (!image && fetchLang !== 'en') {
      const en = (await getCard('en', cardId)) as { image?: string } | undefined
      image = cardImageUrl(en?.image, 'high')
    }
    if (!image) {
      image =
        inferMissingImageCandidates({
          cardId,
          name: raw.name || existing?.name,
          localId: raw.localId ?? existing?.localId,
        })[0] ?? existing?.image
    }

    const quote = await quoteFromPricing(cardId, raw.pricing, {
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
    rarity: existing?.rarity,
    types: existing?.types,
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
