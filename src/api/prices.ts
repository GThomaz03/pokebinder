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
}): CachedCard {
  const id = baseCardId(brief.id)
  const existing = cardCache[id]
  if (existing && existing.price.updated) return existing
  const cached: CachedCard = {
    id,
    name: brief.name,
    localId: String(brief.localId),
    image: brief.image
      ? brief.image.includes('/high.') || brief.image.includes('/low.')
        ? brief.image
        : cardImageUrl(brief.image, 'high')
      : undefined,
    price: brief.price ?? { updated: 0 },
  }
  cardCache = { ...cardCache, [id]: cached }
  if (brief.price) {
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

export async function formatPriceBrl(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): Promise<string | null> {
  if (!price) return null
  const fx = await getFxRates()
  const brl =
    market === 'cardmarket'
      ? toBrl(price.eur, 'EUR', fx) ?? toBrl(price.usd, 'USD', fx)
      : toBrl(price.usd, 'USD', fx) ?? toBrl(price.eur, 'EUR', fx)
  if (brl == null) return null
  return brl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Sync formatter using last known FX (or fallback). Prefer formatPriceBrl when possible. */
export function formatPrice(
  price: CardPrice | undefined,
  market: PriceMarket = 'cardmarket',
): string | null {
  if (!price) return null
  const fx = memoryFx()
  const brl =
    market === 'cardmarket'
      ? toBrl(price.eur, 'EUR', fx) ?? toBrl(price.usd, 'USD', fx)
      : toBrl(price.usd, 'USD', fx) ?? toBrl(price.eur, 'EUR', fx)
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
