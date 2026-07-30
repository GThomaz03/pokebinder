import type { CachedCard, CardPrice, PriceMarket } from '../types'
import { baseCardId, cardImageUrl, extractPrice, getCard, parseOwnedKey } from './tcgdex'
import type { CardLang } from '../types'
import { getFxRates, toBrl } from './fx'

const PRICE_KEY = 'pokebinder-prices-v1'
const CARD_KEY = 'pokebinder-cards-v1'

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
  localStorage.setItem(PRICE_KEY, JSON.stringify(priceCache))
}

function persistCards() {
  localStorage.setItem(CARD_KEY, JSON.stringify(cardCache))
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
  const stale =
    !existing ||
    force ||
    Date.now() - (existing.price.updated || 0) > 1000 * 60 * 60 * 24

  if (existing && !stale && !force && !parsed.lang && existing.image) return existing

  try {
    const card = await getCard(fetchLang, cardId)
    if (!card) return existing ?? null
    const price = extractPrice(card as Parameters<typeof extractPrice>[0])
    const cached: CachedCard = {
      id: card.id,
      name: card.name,
      localId: String(card.localId),
      image: cardImageUrl(card.image, 'high'),
      setName: card.set?.name,
      setId: card.set?.id,
      illustrator: (card as { illustrator?: string }).illustrator,
      rarity: (card as { rarity?: string }).rarity,
      types: (card as { types?: string[] }).types,
      dexId: card.dexId,
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
  const image = brief.image
    ? brief.image.includes('/high.') || brief.image.includes('/low.')
      ? brief.image
      : cardImageUrl(brief.image, 'high')
    : existing?.image
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

function amountInBrl(
  price: CardPrice,
  market: PriceMarket,
  fx: { eurToBrl: number; usdToBrl: number; updated?: number },
): number | null {
  const rates = { eurToBrl: fx.eurToBrl, usdToBrl: fx.usdToBrl, updated: fx.updated ?? 0 }
  return (
    market === 'cardmarket'
      ? toBrl(price.eur, 'EUR', rates) ?? toBrl(price.usd, 'USD', rates)
      : toBrl(price.usd, 'USD', rates) ?? toBrl(price.eur, 'EUR', rates)
  ) ?? null
}

/** Numeric BRL value using last known FX (or fallback). */
export function priceToBrl(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): number | null {
  if (!price) return null
  return amountInBrl(price, market, memoryFx())
}

export async function formatPriceBrl(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): Promise<string | null> {
  if (!price) return null
  const fx = await getFxRates()
  const brl = amountInBrl(price, market, fx)
  if (brl == null) return null
  return brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Sync formatter using last known FX (or fallback). Prefer formatPriceBrl when possible. */
export function formatPrice(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): string | null {
  const brl = priceToBrl(price, market)
  if (brl == null) return null
  return brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function memoryFx() {
  try {
    const raw = localStorage.getItem('pokebinder-fx-v1')
    if (raw) return JSON.parse(raw) as { eurToBrl: number; usdToBrl: number; updated: number }
  } catch {
    // ignore
  }
  return { updated: 0, eurToBrl: 5.8, usdToBrl: 5.1 }
}

// Warm FX on module load (browser only)
if (typeof window !== 'undefined') {
  void getFxRates()
}
