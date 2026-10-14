import { describe, expect, it } from 'vitest'
import { groupCatalogSets } from './setGroups'

describe('collection grouping', () => {
  it('merges the Portuguese and English copies of the same set', () => {
    const [group] = groupCatalogSets([
      {
        sourceId: 'swsh4.5',
        name: 'Destinos Brilhantes',
        ptName: 'Destinos Brilhantes',
        enName: 'Shining Fates',
        cardCount: 73,
        logoUrl: 'https://assets.tcgdex.net/en/swsh/swsh4.5/logo',
      },
      {
        sourceId: 'swsh45',
        name: 'Shining Fates',
        enName: 'Shining Fates',
        cardCount: 73,
        logoUrl: 'https://images.pokemontcg.io/swsh45/logo.png',
      },
    ])
    expect(group?.id).toBe('swsh4.5')
    expect(group?.name).toBe('Destinos Brilhantes')
    expect(group?.editions.map((edition) => edition.lang)).toEqual(['pt', 'en'])
    expect(group?.covers[0]).toBe('https://assets.tcgdex.net/pt/swsh/swsh4.5/logo.webp')
    expect(group?.covers).toContain('https://assets.tcgdex.net/en/swsh/swsh45/logo.webp')
  })

  it('keeps a Japanese set separate from the international set that shares a number', () => {
    const groups = groupCatalogSets([
      {
        sourceId: 'sv03.5',
        name: '151',
        ptName: '151',
        enName: '151',
        cardCount: 207,
      },
      {
        sourceId: 'sv3pt5',
        name: '151',
        enName: '151',
        cardCount: 207,
      },
      {
        sourceId: 'SV2a',
        name: 'ポケモンカード151',
        jpName: 'ポケモンカード151',
        enName: '151',
        cardCount: 207,
      },
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find((group) => group.id === 'SV2a')?.editions[0]?.lang).toBe('ja')
    expect(groups.find((group) => group.id === 'SV2a')?.covers[0]).toContain('/ja/SV/SV2a/')
  })

  it('uses the Portuguese logo stored under the real series folder', () => {
    const [group] = groupCatalogSets([
      {
        sourceId: 'cel25',
        name: 'Celebrações',
        ptName: 'Celebrações',
        enName: 'Celebrations',
        cardCount: 25,
        logoUrl: 'https://assets.tcgdex.net/en/swsh/cel25/logo',
      },
    ])
    expect(group?.covers[0]).toBe('https://assets.tcgdex.net/pt/swsh/cel25/logo.webp')
    expect(group?.editions.map((edition) => edition.lang)).toEqual(['pt', 'en'])
  })

  it('keeps a verified logo ahead of guesses that have no file', () => {
    const [group] = groupCatalogSets([
      {
        sourceId: '2023sv',
        name: "McDonald's Collection 2023",
        enName: "McDonald's Collection 2023",
        cardCount: 15,
      },
    ])
    expect(group?.covers[0]).toContain('mcdonald_s-match-battle-2023.png')
  })

  it('uses the English cover when there is no Portuguese edition', () => {
    const [group] = groupCatalogSets([
      {
        sourceId: 'base1',
        name: 'Base Set',
        enName: 'Base Set',
        cardCount: 102,
        logoUrl: 'https://assets.tcgdex.net/en/base/base1/logo',
      },
    ])
    expect(group?.name).toBe('Base Set')
    expect(group?.covers[0]).toBe('https://assets.tcgdex.net/en/base/base1/logo.webp')
    expect(group?.editions).toEqual([{ id: 'base1', lang: 'en', name: 'Base Set' }])
  })
})
