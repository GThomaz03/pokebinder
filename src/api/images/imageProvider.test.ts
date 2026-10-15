import { describe, expect, it } from 'vitest'
import {
  cardImageCandidates,
  inferMissingImageCandidates,
  isLegacyCatalogImage,
  isPokemonTcgCardBack,
} from './imageProvider'

const STELLAR = 'https://assets.tcgdex.net/pt/sv/sv07/001'

describe('card images', () => {
  it('keeps a TCGdex asset base and expands it to a real file', () => {
    expect(isLegacyCatalogImage(STELLAR)).toBe(false)
    expect(cardImageCandidates(STELLAR, 'low')[0]).toBe(`${STELLAR}/low.webp`)
  })

  it('tries the English file when a resolved Portuguese URL is missing', () => {
    const portuguese = 'https://assets.tcgdex.net/pt/xy/xy3/66/high.webp'
    const urls = cardImageCandidates(portuguese, 'high')
    expect(urls[0]).toBe(portuguese)
    expect(urls).toContain('https://assets.tcgdex.net/en/xy/xy3/66/high.webp')
    expect(urls).toContain('https://assets.tcgdex.net/pt/xy/xy3/66/low.webp')
  })

  it('rejects the Scrydex card-back URL for a padded set id', () => {
    expect(isLegacyCatalogImage('https://images.scrydex.com/pokemon/sv07-001/small')).toBe(true)
    expect(isLegacyCatalogImage('https://images.scrydex.com/pokemon/sv7-1/small')).toBe(false)
  })

  it('uses the PokémonTCG.io McDonald folder instead of the card-back path', () => {
    expect(isLegacyCatalogImage('https://images.pokemontcg.io/2011bw/1.png')).toBe(true)
    const urls = inferMissingImageCandidates({ cardId: '2011bw-1', localId: '1', name: 'Snivy' })
    expect(urls[0]).toBe('https://images.pokemontcg.io/mcd11/1.png')
    expect(urls.some((url) => url.includes('/2011bw/'))).toBe(false)
  })

  it('recognizes the PokémonTCG.io card-back bitmap', () => {
    expect(isPokemonTcgCardBack('https://images.pokemontcg.io/mcd24/6.png', 640, 892)).toBe(true)
    expect(isPokemonTcgCardBack('https://images.scrydex.com/pokemon/swsh4pt5sv-sv060/large', 640, 892)).toBe(true)
    expect(isPokemonTcgCardBack('https://images.pokemontcg.io/sv6/130.png', 245, 337)).toBe(false)
    expect(isPokemonTcgCardBack('https://assets.tcgdex.net/pt/sv/sv06/130/low.webp', 640, 892)).toBe(false)
  })

  it('keeps a Pokémon illustration when a type is also passed', () => {
    const urls = inferMissingImageCandidates({
      cardId: '2011bw-1',
      localId: '1',
      name: 'Snivy',
      energyType: 'Grass',
    })
    expect(urls[0]).toBe('https://images.pokemontcg.io/mcd11/1.png')
    expect(urls.some((url) => url.includes('/sve/'))).toBe(false)
  })

  it('does not offer the Scrydex placeholder before a real CDN for Coroa Estelar', () => {
    const urls = inferMissingImageCandidates({ cardId: 'sv07-001', localId: '001', name: 'Venusaur ex' })
    expect(urls[0]).toMatch(/images\.pokemontcg\.io\/sv7\/1\.png$/)
    expect(urls.some((url) => url.includes('/sv07-001/'))).toBe(false)
    expect(urls.some((url) => url === `${STELLAR}/low.webp`.replace('/pt/', '/en/'))).toBe(true)
  })
})
