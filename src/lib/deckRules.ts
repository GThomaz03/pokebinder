import type { Deck, DeckCategory, DeckEntry } from '../types'

export const DECK_SIZE = 60
export const MAX_COPIES = 4

export type DeckIssue = {
  code: string
  severity: 'error' | 'warn'
  message: string
}

export type DeckValidation = {
  total: number
  pokemon: number
  trainer: number
  energy: number
  basicPokemon: number
  ownedNeeded: number
  missingNeeded: number
  complete: boolean
  legal: boolean
  issues: DeckIssue[]
}

export function deckTotal(deck: Deck): number {
  return deck.cards.reduce((s, c) => s + c.qty, 0)
}

export function countByCategory(deck: Deck): Record<DeckCategory, number> {
  const out: Record<DeckCategory, number> = { Pokemon: 0, Trainer: 0, Energy: 0 }
  for (const c of deck.cards) out[c.category] += c.qty
  return out
}

/** Same-name rule uses printed name (case-insensitive). */
export function normalizeCardName(name: string): string {
  return name.trim().toLowerCase()
}

export function copiesOfName(deck: Deck, name: string): number {
  const key = normalizeCardName(name)
  return deck.cards
    .filter((c) => normalizeCardName(c.name) === key)
    .reduce((s, c) => s + c.qty, 0)
}

export function maxAllowedForEntry(entry: Pick<DeckEntry, 'isBasicEnergy'>): number {
  return entry.isBasicEnergy ? DECK_SIZE - 1 : MAX_COPIES
}

export function validateDeck(
  deck: Deck,
  getOwnedQty: (cardId: string) => number,
): DeckValidation {
  const total = deckTotal(deck)
  const byCat = countByCategory(deck)
  const issues: DeckIssue[] = []

  let basicPokemon = 0
  let radiantCount = 0
  let aceSpecCount = 0
  const nameCounts = new Map<string, { qty: number; isBasicEnergy: boolean; name: string }>()

  for (const card of deck.cards) {
    if (card.category === 'Pokemon' && isBasicStage(card.stage)) {
      basicPokemon += card.qty
    }
    if (card.isRadiant) radiantCount += card.qty
    if (card.isAceSpec) aceSpecCount += card.qty

    const key = normalizeCardName(card.name)
    const prev = nameCounts.get(key)
    if (prev) {
      prev.qty += card.qty
      prev.isBasicEnergy = prev.isBasicEnergy || Boolean(card.isBasicEnergy)
    } else {
      nameCounts.set(key, {
        qty: card.qty,
        isBasicEnergy: Boolean(card.isBasicEnergy),
        name: card.name,
      })
    }
  }

  if (total !== DECK_SIZE) {
    issues.push({
      code: 'size',
      severity: 'error',
      message:
        total < DECK_SIZE
          ? `Faltam ${DECK_SIZE - total} carta(s) para chegar a 60.`
          : `O deck tem ${total - DECK_SIZE} carta(s) a mais (máx. 60).`,
    })
  }

  if (basicPokemon < 1) {
    issues.push({
      code: 'basic',
      severity: 'error',
      message: 'É necessário pelo menos 1 Pokémon Básico.',
    })
  }

  for (const { qty, isBasicEnergy, name } of nameCounts.values()) {
    if (!isBasicEnergy && qty > MAX_COPIES) {
      issues.push({
        code: 'copies',
        severity: 'error',
        message: `Mais de 4 cópias de “${name}” (tem ${qty}).`,
      })
    }
  }

  if (radiantCount > 1) {
    issues.push({
      code: 'radiant',
      severity: 'error',
      message: `Máximo 1 Pokémon Radiant / Radiante no deck (tem ${radiantCount}).`,
    })
  }

  if (aceSpecCount > 1) {
    issues.push({
      code: 'acespec',
      severity: 'error',
      message: `Máximo 1 carta ACE SPEC no deck (tem ${aceSpecCount}).`,
    })
  }

  let ownedNeeded = 0
  let missingNeeded = 0
  for (const card of deck.cards) {
    const have = getOwnedQty(card.cardId)
    const need = card.qty
    ownedNeeded += Math.min(have, need)
    missingNeeded += Math.max(0, need - have)
  }

  if (missingNeeded > 0 && total > 0) {
    issues.push({
      code: 'ownership',
      severity: 'warn',
      message: `Você não tem ${missingNeeded} cópia(s) deste deck no repositório.`,
    })
  }

  const legal = issues.every((i) => i.severity !== 'error')
  return {
    total,
    pokemon: byCat.Pokemon,
    trainer: byCat.Trainer,
    energy: byCat.Energy,
    basicPokemon,
    ownedNeeded,
    missingNeeded,
    complete: total === DECK_SIZE,
    legal,
    issues,
  }
}

export function isBasicStage(stage?: string): boolean {
  if (!stage) return false
  const s = stage.toLowerCase()
  return s === 'basic' || s === 'básico' || s === 'basico'
}

export function detectRadiant(name: string): boolean {
  return /^(radiant|radiante)\b/i.test(name.trim())
}

export function detectAceSpec(rarity?: string, effect?: string): boolean {
  const blob = `${rarity ?? ''} ${effect ?? ''}`
  return /ace\s*spec/i.test(blob)
}

export function detectBasicEnergy(opts: {
  category: string
  energyType?: string
  name: string
  effect?: string
}): boolean {
  if (opts.category !== 'Energy') return false
  if (opts.energyType && /special/i.test(opts.energyType)) return false
  if (opts.energyType && /normal/i.test(opts.energyType)) return true
  // Fallback: basic energies rarely have long rules text
  if (opts.effect && opts.effect.trim().length > 40) return false
  return /energy|energia/i.test(opts.name)
}

export function sortedDeckCards(cards: DeckEntry[]): DeckEntry[] {
  const order: Record<DeckCategory, number> = { Pokemon: 0, Trainer: 1, Energy: 2 }
  return [...cards].sort((a, b) => {
    const ca = order[a.category] - order[b.category]
    if (ca !== 0) return ca
    return a.name.localeCompare(b.name, 'pt-BR')
  })
}
