import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LIGA_CSV_HEADERS,
  ligaColorCode,
  ligaRarityCode,
  ligaSetCodeFor,
  ligaFormatCardNumber,
  ligaFormatSetTotal,
  prepareLigaExportData,
  toLigaCollectionCsv,
  toLigaListTxt,
  rowsFromInventory,
  type LigaExportRow,
} from './ligaPokemonExport'
import type { CachedCard } from '../types'

const cardCache: Record<string, CachedCard> = {}

const mockGetCachedCard = vi.fn((id: string) => {
  const base = id.includes('::') ? id.slice(0, id.indexOf('::')) : id
  return cardCache[base]
})

const mockSeedCardBrief = vi.fn((brief: CachedCard & { localId?: string | number }) => {
  const entry: CachedCard = {
    id: brief.id,
    name: brief.name,
    localId: String(brief.localId ?? ''),
    setId: brief.setId,
    setName: brief.setName,
    rarity: brief.rarity,
    types: brief.types,
    price: { updated: 0 },
  }
  cardCache[brief.id] = entry
  return entry
})

const mockGetCardsByIdsRepo = vi.fn()

vi.mock('../api/prices', () => ({
  getCachedCard: (id: string) => mockGetCachedCard(id),
  seedCardBrief: (brief: CachedCard) => mockSeedCardBrief(brief),
}))

vi.mock('../api/cards/cardRepository', () => ({
  getCardsByIdsRepo: (...args: unknown[]) => mockGetCardsByIdsRepo(...args),
}))

describe('ligaPokemonExport', () => {
  beforeEach(() => {
    for (const k of Object.keys(cardCache)) delete cardCache[k]
    mockGetCachedCard.mockClear()
    mockSeedCardBrief.mockClear()
    mockGetCardsByIdsRepo.mockReset()
    mockGetCardsByIdsRepo.mockResolvedValue(new Map())
  })

  it('maps me2 to PFL and sv9 to JTG', () => {
    expect(ligaSetCodeFor('me2').code).toBe('PFL')
    expect(ligaSetCodeFor('me02').code).toBe('PFL')
    expect(ligaSetCodeFor('sv9').code).toBe('JTG')
  })

  it('maps SWSH / special sets to Liga codes (never raw SWSH12/SV10PT)', () => {
    expect(ligaSetCodeFor('swsh12').code).toBe('SIT')
    expect(ligaSetCodeFor('swsh12tg').code).toBe('SIT')
    expect(ligaSetCodeFor('swshp').code).toBe('PR-SW')
    expect(ligaSetCodeFor('rsv10pt5').code).toBe('WHT')
    expect(ligaSetCodeFor('zsv10pt5').code).toBe('BLK')
    expect(ligaSetCodeFor('swsh12', 'SWSH12').code).toBe('SIT')
    expect(ligaSetCodeFor('unknown-set').code).toBe('')
  })

  it('omits stub id names from CSV (Card não encontrado)', () => {
    const cards: Record<string, CachedCard> = {
      'svp-173': {
        id: 'svp-173',
        name: 'svp-173',
        localId: '173',
        setId: 'svp',
        setName: 'SV Promos',
        rarity: 'Promo',
        types: [],
        price: { updated: 0 },
      },
    }
    const rows = rowsFromInventory([{ key: 'svp-173', qty: 1 }], (id) => cards[id])
    expect(rows[0]?.missingCardName).toBe(true)
    expect(toLigaCollectionCsv(rows)).not.toContain('svp-173')
  })

  it('prepareLigaExportData batch-fetches missing names from Supabase only', async () => {
    mockGetCardsByIdsRepo.mockResolvedValue(
      new Map([
        [
          'me02.5-040',
          {
            id: 'me2pt5-40',
            name: 'Ascended Hero',
            localId: '40',
            setId: 'me2pt5',
            setName: 'Ascended Heroes',
            lang: 'en' as const,
          },
        ],
      ]),
    )

    const { rows, stats } = await prepareLigaExportData('en', [{ key: 'me02.5-040', qty: 1 }])

    expect(mockGetCardsByIdsRepo).toHaveBeenCalledWith('pt', ['me02.5-040'])
    expect(mockGetCardsByIdsRepo).toHaveBeenCalledWith('en', ['me02.5-040'])
    expect(mockSeedCardBrief).toHaveBeenCalled()
    expect(rows[0]?.nameEn).toBe('Ascended Hero')
    expect(stats.exportable).toBe(1)
    expect(stats.missingName).toBe(0)
  })

  it('prepareLigaExportData skips batch when cache already has a real name', async () => {
    cardCache['me2-2'] = {
      id: 'me2-2',
      name: 'Gloom',
      localId: '2',
      setId: 'me2',
      price: { updated: 0 },
    }

    const { stats } = await prepareLigaExportData('en', [{ key: 'me2-2', qty: 1 }])

    expect(mockGetCardsByIdsRepo).toHaveBeenCalledWith('pt', ['me2-2'])
    expect(mockGetCardsByIdsRepo).toHaveBeenCalledWith('en', ['me2-2'])
    expect(stats.exportable).toBe(1)
  })

  it('prepareLigaExportData counts missing catalog cards without external fetch retry', async () => {
    mockGetCardsByIdsRepo.mockResolvedValue(new Map())

    const { stats } = await prepareLigaExportData('en', [{ key: 'svp-999', qty: 1 }])

    expect(mockGetCardsByIdsRepo).toHaveBeenCalledWith('pt', ['svp-999'])
    expect(stats.missingName).toBe(1)
    expect(stats.exportable).toBe(0)
  })

  it('builds Liga list TXT in Bazar format: qty name [SIGLA] number', () => {
    const rows: LigaExportRow[] = [
      {
        qty: 1,
        nameEn: 'Adversity Policy',
        namePt: 'Apólice de Adversidade',
        cardNumber: '74',
        setCode: 'CRI',
        setNameEn: 'Chaos Rising',
        setNamePt: 'Caos Ascendente',
        setCardCount: '86',
        quality: 'NM',
        language: '',
        rarity: '',
        color: '',
        extras: '',
        comment: '',
        cardId: 'me4-74',
      },
      {
        qty: 2,
        nameEn: 'Weedle',
        namePt: 'Weedle',
        cardNumber: '1',
        setCode: 'CRI',
        setNameEn: 'Chaos Rising',
        setNamePt: 'Caos Ascendente',
        setCardCount: '86',
        quality: 'NM',
        language: '',
        rarity: '',
        color: '',
        extras: '',
        comment: '',
        cardId: 'me4-1',
      },
    ]
    const txt = toLigaListTxt(rows)
    expect(txt).toContain('1 Apólice de Adversidade [CRI] 74/86')
    expect(txt).toContain('2 Weedle [CRI] 1/86')
    expect(txt).not.toMatch(/\(74\)/)
  })

  it('uses Portuguese edition names and padded numbers in CSV', () => {
    const rows: LigaExportRow[] = [
      {
        qty: 2,
        nameEn: 'Weedle',
        namePt: 'Weedle',
        cardNumber: '001',
        setCode: 'CRI',
        setNameEn: 'Chaos Rising',
        setNamePt: 'Caos Ascendente',
        setCardCount: '086',
        quality: 'NM',
        language: '',
        rarity: 'C',
        color: 'G',
        extras: '',
        comment: '',
        cardId: 'me4-1',
      },
    ]
    const csv = toLigaCollectionCsv(rows)
    expect(csv).toContain('Caos Ascendente,"Chaos Rising",CRI')
    expect(csv).toContain(',001,,086')
    expect(csv).not.toContain('Chaos Rising,Chaos Rising,CRI')
  })

  it('ligaFormatCardNumber pads numeric collector numbers', () => {
    expect(ligaFormatCardNumber('1')).toBe('001')
    expect(ligaFormatCardNumber('29')).toBe('029')
    expect(ligaFormatCardNumber('110')).toBe('110')
    expect(ligaFormatSetTotal(86)).toBe('086')
  })

  it('maps rarity and color like the Liga sample', () => {
    expect(ligaRarityCode('Special Illustration Rare')).toBe('IS')
    expect(ligaColorCode(['Darkness'])).toBe('D')
  })

  it('builds LigaPokemon 14-column CSV matching official export headers', () => {
    const rows: LigaExportRow[] = [
      {
        qty: 1,
        nameEn: "N's Zoroark ex",
        namePt: 'Zoroark ex do N',
        cardNumber: '185',
        setCode: 'JTG',
        setNameEn: 'Journey Together',
        setNamePt: 'Amigos de Jornada',
        setCardCount: '159',
        quality: 'NM',
        language: '',
        rarity: 'IS',
        color: 'D',
        extras: '',
        comment: '',
        cardId: 'sv9-185',
      },
    ]
    const csv = toLigaCollectionCsv(rows)
    for (const h of LIGA_CSV_HEADERS) {
      expect(csv).toContain(h)
    }
    expect(csv).toContain('Amigos de Jornada')
    expect(csv).toContain('Journey Together')
    expect(csv).toContain('JTG')
    expect(csv).toContain("N's Zoroark ex")
    expect(csv).toMatch(/,1,NM,,IS,D,,185,,159/)
  })

  it('aggregates inventory rows', () => {
    const cards: Record<string, CachedCard> = {
      'me02-002': {
        id: 'me02-002',
        name: 'Gloom',
        localId: '002',
        setId: 'me02',
        setName: 'Phantasmal Flames',
        rarity: 'Common',
        types: ['Grass'],
        price: { updated: 0 },
      },
    }
    const rows = rowsFromInventory(
      [
        { key: 'me02-002', qty: 1 },
        { key: 'me02-002::pt::reverse', qty: 2 },
      ],
      (id) => cards[id],
    )
    expect(rows).toHaveLength(2)
    expect(rows.reduce((s, r) => s + r.qty, 0)).toBe(3)
    expect(rows[0]?.setCode).toBe('PFL')
    expect(toLigaListTxt(rows)).toContain('Gloom')
  })
})
