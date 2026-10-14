import { describe, expect, it } from 'vitest'
import { catalogCardIdCandidates } from '../cardKeys'
import {
  canonicalBelongsToSet,
  canonicalIdLikePrefix,
  categoryAliases,
  compareLocalIds,
  numberSearchVariants,
  resolveExistingSetId,
  sanitizeSearchTerm,
  setIdFromCanonicalId,
  setSourceIdCandidates,
  typeAliases,
} from './catalogQuery'

describe('set id case', () => {
  const existing = new Set(['sm12', 'SM12', 'sv1', 'sv10', 'SV10'])

  it('keeps English and Japanese sets distinct', () => {
    expect(resolveExistingSetId('SM12', existing)).toBe('SM12')
    expect(resolveExistingSetId('sm12', existing)).toBe('sm12')
    expect(resolveExistingSetId('SV10', existing)).toBe('SV10')
  })

  it('falls back to the normalized id only when the exact id is absent', () => {
    expect(setSourceIdCandidates('sv01')).toEqual(['sv01', 'sv1'])
    expect(resolveExistingSetId('sv01', existing)).toBe('sv1')
    expect(resolveExistingSetId('SM12', existing)).toBe('SM12')
  })

  it('looks up the original case before the lowercase id', () => {
    expect(catalogCardIdCandidates('SM12-1')).toEqual(['SM12-1', 'sm12-1'])
    expect(catalogCardIdCandidates('sv01-001')).toEqual(['sv01-001', 'sv1-1'])
  })

  it('assigns a card to the set encoded in its canonical id', () => {
    expect(setIdFromCanonicalId('sm12-143a')).toBe('sm12')
    expect(setIdFromCanonicalId('SM12-001')).toBe('SM12')
    expect(canonicalBelongsToSet('sm12-1', 'sm12')).toBe(true)
    expect(canonicalBelongsToSet('sm12-1', 'SM12')).toBe(false)
    expect(setIdFromCanonicalId('tk-sm-l-12')).toBe('tk-sm-l')
  })

  it('builds a case-sensitive prefix for listing a set', () => {
    expect(canonicalIdLikePrefix('sm12')).toBe('sm12-%')
    expect(canonicalIdLikePrefix('SM12')).toBe('SM12-%')
    expect(canonicalIdLikePrefix('sv_10')).toBe('sv\\_10-%')
  })
})

describe('catalog filters', () => {
  it('matches categories stored in English and Portuguese', () => {
    expect(categoryAliases('Pokemon')).toEqual(['Pokemon', 'Pokémon'])
    expect(categoryAliases('Trainer')).toContain('Treinador')
    expect(categoryAliases('Energy')).toContain('Energia')
  })

  it('matches types stored in English and Portuguese', () => {
    expect(typeAliases('Fire')).toEqual(['Fire', 'Fogo'])
    expect(typeAliases('Water')).toContain('Água')
    expect(typeAliases('Colorless')).toContain('Incolor')
  })

  it('sorts collector numbers numerically', () => {
    expect(['10', '2', '10a', '1'].sort(compareLocalIds)).toEqual(['1', '2', '10', '10a'])
  })

  it('reads a printed fraction and strips padding zeros', () => {
    expect(numberSearchVariants('009/094')).toEqual(['009', '9'])
    expect(numberSearchVariants('#025')).toEqual(['025', '25'])
    expect(numberSearchVariants('Pikachu')).toEqual([])
  })

  it('removes characters that would split a PostgREST filter', () => {
    expect(sanitizeSearchTerm('Pikachu, (100%)')).toBe('Pikachu 100')
  })
})
