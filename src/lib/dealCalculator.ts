import type { DealLevel, DealResult } from '../types/sealed'

export const DEAL_LEVEL_LABELS: Record<DealLevel, string> = {
  great: 'Ótimo negócio',
  good: 'Bom negócio',
  average: 'Na média',
  expensive: 'Mais caro',
}

/** pct = (promo / fair - 1) * 100 */
export function classifyDeal(pct: number): DealLevel {
  if (pct <= -20) return 'great'
  if (pct <= -8) return 'good'
  if (pct <= 8) return 'average'
  return 'expensive'
}

export function evaluateDeal(input: {
  packCount: number
  boosterPrice: number
  promoPrice: number
}): DealResult | null {
  const { packCount, boosterPrice, promoPrice } = input
  if (
    !Number.isFinite(packCount) ||
    !Number.isFinite(boosterPrice) ||
    !Number.isFinite(promoPrice) ||
    packCount <= 0 ||
    boosterPrice <= 0 ||
    promoPrice < 0
  ) {
    return null
  }

  const fairPrice = packCount * boosterPrice
  if (fairPrice <= 0) return null

  const diff = promoPrice - fairPrice
  const pct = (promoPrice / fairPrice - 1) * 100

  return {
    fairPrice,
    promoPrice,
    diff,
    pct,
    level: classifyDeal(pct),
    packCount,
    boosterPrice,
  }
}

export function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : ''
  return `${sign}${pct.toFixed(1).replace('.', ',')}%`
}
