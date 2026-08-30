import type { ExternalCard, NormalizedCatalogCard } from '../types'

const SOURCE = 'tcgdex'

function cardImageUrls(imageBase?: string) {
  if (!imageBase) return {}
  if (/^https?:\/\//i.test(imageBase)) {
    if (/scrydex\.com\/pokemon\//i.test(imageBase)) {
      const large = /\/small$/i.test(imageBase)
        ? imageBase.replace(/\/small$/i, '/large')
        : /\/large$/i.test(imageBase)
          ? imageBase
          : `${imageBase.replace(/\/$/, '')}/large`
      const small = /\/large$/i.test(imageBase)
        ? imageBase.replace(/\/large$/i, '/small')
        : /\/small$/i.test(imageBase)
          ? imageBase
          : `${imageBase.replace(/\/$/, '')}/small`
      return { imageBase, imageHigh: large, imageLow: small }
    }
    return {
      imageBase,
      imageHigh: imageBase,
      imageLow: imageBase.includes('_hires')
        ? imageBase.replace('_hires', '')
        : imageBase,
    }
  }
  return {
    imageBase,
    imageHigh: `${imageBase}/high.webp`,
    imageLow: `${imageBase}/low.webp`,
  }
}

function mapVariantFlags(variants?: Record<string, boolean>) {
  if (!variants) return [{ variantType: 'normal', isHolo: false, isReverseHolo: false, isFirstEdition: false, isShadowless: false, isPromo: false }]
  const out: NormalizedCatalogCard['variants'] = []
  for (const [type, on] of Object.entries(variants)) {
    if (!on) continue
    out.push({
      variantType: type,
      isHolo: type === 'holo' || type === 'holofoil',
      isReverseHolo: type === 'reverse' || type === 'reverseHolofoil',
      isFirstEdition: type === 'firstEdition' || type === 'first-edition',
      isShadowless: type === 'shadowless',
      isPromo: type === 'wPromo' || type === 'promo' || type === 'stamped',
    })
  }
  return out.length ? out : [{ variantType: 'normal', isHolo: false, isReverseHolo: false, isFirstEdition: false, isShadowless: false, isPromo: false }]
}

function extractPrices(pricing?: Record<string, unknown>): NormalizedCatalogCard['prices'] {
  if (!pricing) return []
  const prices: NormalizedCatalogCard['prices'] = []
  const cm = pricing.cardmarket as Record<string, unknown> | undefined
  const tcg = pricing.tcgplayer as Record<string, unknown> | undefined
  if (cm) {
    prices.push({
      market: 'cardmarket',
      low: num(cm.low),
      mid: num(cm.avg ?? cm.trend),
      high: num(cm.avg30),
      currency: 'EUR',
      variant: 'normal',
    })
  }
  if (tcg) {
    prices.push({
      market: 'tcgplayer',
      low: num(tcg.low),
      mid: num(tcg.mid ?? tcg.market),
      high: num(tcg.high),
      currency: 'USD',
      variant: 'normal',
    })
  }
  return prices
}

function num(v: unknown): number | undefined {
  if (v == null) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

export function normalizeTcgdexCard(
  card: ExternalCard,
  lang = 'en',
  setSourceId?: string,
  source = SOURCE,
): NormalizedCatalogCard {
  const setId = setSourceId ?? card.set?.id ?? card.id.split('-')[0] ?? ''
  const imgs = cardImageUrls(card.image)
  const legalities: Record<string, boolean> = {}
  if (card.legal?.standard != null) legalities.standard = card.legal.standard
  if (card.legal?.expanded != null) legalities.expanded = card.legal.expanded

  return {
    canonicalId: card.id,
    source,
    sourceId: card.id,
    name: card.name,
    language: lang === 'pt' ? 'pt-BR' : lang,
    number: String(card.localId),
    printedNumber: String(card.localId),
    setSourceId: setId,
    category: card.category,
    stage: card.stage,
    trainerType: card.trainerType,
    energyType: card.energyType,
    effect: card.effect ?? card.description,
    hp: card.hp,
    types: card.types ?? [],
    dexIds: card.dexId ?? [],
    rarity: card.rarity,
    artist: card.illustrator,
    regulationMark: card.regulationMark,
    legalities,
    ...imgs,
    variants: mapVariantFlags(card.variants),
    attacks: (card.attacks ?? []).map((a, i) => ({
      name: a.name,
      cost: a.cost ?? [],
      damage: a.damage != null ? String(a.damage) : undefined,
      text: a.effect,
      order: i,
    })),
    weaknesses: (card.weaknesses ?? []).map((w) => ({ type: w.type, value: w.value })),
    resistances: (card.resistances ?? []).map((r) => ({ type: r.type, value: r.value })),
    rules: (card.abilities ?? []).map((a, i) => ({
      ruleType: a.type ?? 'ability',
      text: `${a.name}: ${a.effect ?? ''}`.trim(),
      order: i,
    })),
    translations: [{ language: lang === 'pt' ? 'pt-BR' : lang, name: card.name }],
    prices: extractPrices(card.pricing),
    rawData: (card.raw ?? card) as Record<string, unknown>,
  }
}

export function validateNormalizedCard(card: NormalizedCatalogCard): string[] {
  const errors: string[] = []
  if (!card.canonicalId) errors.push('missing canonicalId')
  if (!card.name) errors.push('missing name')
  if (!card.setSourceId) errors.push('missing setSourceId')
  if (!card.number) errors.push('missing number')
  return errors
}

export function dedupeKey(card: NormalizedCatalogCard): string {
  return `${card.source}:${card.sourceId}`
}

export function mergeTranslations(
  existing: NormalizedCatalogCard['translations'],
  incoming: NormalizedCatalogCard['translations'],
) {
  const byLang = new Map(existing.map((t) => [t.language, t]))
  for (const t of incoming) byLang.set(t.language, { ...byLang.get(t.language), ...t })
  return [...byLang.values()]
}
