import type {
  CardDataSource,
  ExternalCard,
  ExternalCardSummary,
  ExternalSerie,
  ExternalSet,
} from '../../types'
import { fetchJson } from '../../retry'

const RAW_BASE =
  process.env.POKEMON_TCG_DATA_URL ??
  'https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master'

type PtcgSet = {
  id: string
  name: string
  series: string
  printedTotal?: number
  total?: number
  releaseDate?: string
  images?: { logo?: string; symbol?: string }
}

type PtcgCard = {
  id: string
  name: string
  number: string
  supertype?: string
  subtypes?: string[]
  hp?: string
  types?: string[]
  nationalPokedexNumbers?: number[]
  rarity?: string
  artist?: string
  regulationMark?: string
  legalities?: Record<string, string>
  images?: { small?: string; large?: string }
  attacks?: Array<{
    name: string
    cost?: string[]
    damage?: string
    text?: string
  }>
  weaknesses?: Array<{ type: string; value: string }>
  resistances?: Array<{ type: string; value: string }>
  abilities?: Array<{ name: string; text?: string; type?: string }>
  evolvesFrom?: string
  flavorText?: string
  rules?: string[]
}

function slugSeries(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function mapCategory(supertype?: string): string | undefined {
  if (!supertype) return undefined
  if (/pok/i.test(supertype)) return 'Pokemon'
  if (/trainer/i.test(supertype)) return 'Trainer'
  if (/energy/i.test(supertype)) return 'Energy'
  return supertype
}

function mapStage(subtypes?: string[]): string | undefined {
  return subtypes?.find((s) => /stage|basic|restored|mega|level-up|vmax|vstar|^v$/i.test(s))
}

function mapLegalities(legalities?: Record<string, string>) {
  if (!legalities) return undefined
  const standard = legalities.standard?.toLowerCase()
  const expanded = legalities.expanded?.toLowerCase()
  return {
    standard: standard === 'legal',
    expanded: expanded === 'legal',
  }
}

function toExternalCard(card: PtcgCard, set: PtcgSet): ExternalCard {
  const image = card.images?.large ?? card.images?.small
  return {
    id: card.id,
    name: card.name,
    localId: card.number,
    image,
    set: { id: set.id, name: set.name },
    category: mapCategory(card.supertype),
    stage: mapStage(card.subtypes),
    hp: card.hp ? Number(card.hp) : undefined,
    types: card.types,
    dexId: card.nationalPokedexNumbers,
    rarity: card.rarity,
    illustrator: card.artist,
    regulationMark: card.regulationMark,
    legal: mapLegalities(card.legalities),
    variants: { normal: true },
    attacks: (card.attacks ?? []).map((a) => ({
      name: a.name,
      cost: a.cost,
      damage: a.damage,
      effect: a.text,
    })),
    weaknesses: card.weaknesses,
    resistances: card.resistances,
    abilities: (card.abilities ?? []).map((a) => ({
      type: a.type,
      name: a.name,
      effect: a.text,
    })),
    evolveFrom: card.evolvesFrom,
    description: card.flavorText,
    raw: card as unknown as Record<string, unknown>,
  }
}

export class PokemonTcgGithubSource implements CardDataSource {
  readonly name = 'pokemon_tcg_api'
  private setsCache: PtcgSet[] | null = null
  private cardsCache = new Map<string, PtcgCard[]>()

  private async loadSets(): Promise<PtcgSet[]> {
    if (!this.setsCache) {
      this.setsCache = await fetchJson<PtcgSet[]>(`${RAW_BASE}/sets/en.json`, {
        maxRetries: 3,
        timeoutMs: 60000,
      })
    }
    return this.setsCache
  }

  private async loadSetCards(setId: string): Promise<PtcgCard[]> {
    if (!this.cardsCache.has(setId)) {
      try {
        const cards = await fetchJson<PtcgCard[]>(`${RAW_BASE}/cards/en/${setId}.json`, {
          maxRetries: 3,
          timeoutMs: 120000,
        })
        this.cardsCache.set(setId, cards)
      } catch (err) {
        const status = (err as { status?: number }).status
        if (status === 404) {
          this.cardsCache.set(setId, [])
        } else {
          throw err
        }
      }
    }
    return this.cardsCache.get(setId) ?? []
  }

  async getSeries(): Promise<ExternalSerie[]> {
    const sets = await this.loadSets()
    const byId = new Map<string, ExternalSerie>()
    for (const set of sets) {
      const id = slugSeries(set.series)
      if (!byId.has(id)) {
        byId.set(id, { id, name: set.series })
      }
    }
    return [...byId.values()]
  }

  async getSets(): Promise<ExternalSet[]> {
    const sets = await this.loadSets()
    return sets.map((s) => ({
      id: s.id,
      name: s.name,
      serieId: slugSeries(s.series),
      serieName: s.series,
      logo: s.images?.logo,
      symbol: s.images?.symbol,
      cardCount: { total: s.total, official: s.printedTotal ?? s.total },
      releaseDate: s.releaseDate?.replace(/\//g, '-'),
    }))
  }

  async getCards(setId: string): Promise<ExternalCardSummary[]> {
    const cards = await this.loadSetCards(setId)
    return cards.map((c) => ({
      id: c.id,
      name: c.name,
      localId: c.number,
      image: c.images?.large,
      setId,
    }))
  }

  async getCard(cardId: string): Promise<ExternalCard | null> {
    const setId = cardId.includes('-') ? cardId.slice(0, cardId.lastIndexOf('-')) : cardId
    const sets = await this.loadSets()
    const set = sets.find((s) => s.id === setId)
    if (!set) return null
    const cards = await this.loadSetCards(setId)
    const card = cards.find((c) => c.id === cardId)
    return card ? toExternalCard(card, set) : null
  }
}

export async function isTcgdexApiReachable(timeoutMs = 8000): Promise<boolean> {
  try {
    await fetchJson<unknown[]>('https://api.tcgdex.net/v2/en/series', {
      maxRetries: 0,
      timeoutMs,
      rateLimitMs: 0,
    })
    return true
  } catch {
    return false
  }
}

export async function createImportSources(): Promise<{
  primary: CardDataSource
  translations: CardDataSource[]
  checkpointSource: string
  dataSourceName: string
}> {
  const forced = process.env.CATALOG_IMPORT_SOURCE
  if (forced === 'github' || forced === 'pokemon_tcg_api') {
    return {
      primary: new PokemonTcgGithubSource(),
      translations: [],
      checkpointSource: 'pokemon_tcg_api',
      dataSourceName: 'pokemon_tcg_api',
    }
  }
  if (forced === 'tcgdex' || forced === 'api') {
    const { TcgdexApiSource, createTcgdexSources } = await import('../tcgdex/apiSource')
    return {
      primary: new TcgdexApiSource(),
      translations: createTcgdexSources(['pt']),
      checkpointSource: 'tcgdex',
      dataSourceName: 'tcgdex',
    }
  }

  if (await isTcgdexApiReachable()) {
    const { TcgdexApiSource, createTcgdexSources } = await import('../tcgdex/apiSource')
    return {
      primary: new TcgdexApiSource(),
      translations: createTcgdexSources(['pt']),
      checkpointSource: 'tcgdex',
      dataSourceName: 'tcgdex',
    }
  }

  console.warn('TCGdex API indisponível — usando dataset GitHub (PokemonTCG/pokemon-tcg-data)')
  return {
    primary: new PokemonTcgGithubSource(),
    translations: [],
    checkpointSource: 'pokemon_tcg_api',
    dataSourceName: 'pokemon_tcg_api',
  }
}
