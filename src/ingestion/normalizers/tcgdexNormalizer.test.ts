import { describe, expect, it } from 'vitest'
import {
  normalizeTcgdexCard,
  validateNormalizedCard,
  dedupeKey,
} from './tcgdexNormalizer'

describe('tcgdex normalizer', () => {
  it('imports a card with canonical id', () => {
    const card = normalizeTcgdexCard(
      {
        id: 'base1-4',
        name: 'Charizard',
        localId: '4',
        set: { id: 'base1', name: 'Base Set' },
        category: 'Pokémon',
        types: ['Fire'],
        dexId: [6],
        variants: { holo: true, normal: true },
      },
      'en',
      'base1',
    )
    expect(card.canonicalId).toBe('base1-4')
    expect(card.setSourceId).toBe('base1')
    expect(card.variants.length).toBeGreaterThan(0)
    expect(validateNormalizedCard(card)).toEqual([])
  })

  it('dedupe key uses source and id', () => {
    const card = normalizeTcgdexCard(
      { id: 'sv1-1', name: 'Test', localId: '1' },
      'en',
      'sv1',
    )
    expect(dedupeKey(card)).toBe('tcgdex:sv1-1')
  })
})

describe('validation', () => {
  it('rejects card without set', () => {
    const card = normalizeTcgdexCard(
      { id: 'x-1', name: 'X', localId: '1' },
      'en',
      '',
    )
    expect(validateNormalizedCard(card).length).toBeGreaterThan(0)
  })
})
