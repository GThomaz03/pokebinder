import type {
  CardDataSource,
  ExternalCard,
  ExternalCardSummary,
  ExternalSerie,
  ExternalSet,
} from '../../types'
import { fetchJson } from '../../retry'

const DEFAULT_BASE = process.env.TCGDEX_API_URL ?? 'https://api.tcgdex.net/v2'

type TcgLang = 'en' | 'pt' | 'ja'

function toApiLang(lang: string): TcgLang {
  if (lang === 'pt' || lang === 'pt-BR') return 'pt'
  if (lang === 'ja') return 'ja'
  return 'en'
}

export class TcgdexApiSource implements CardDataSource {
  readonly name = 'tcgdex'
  readonly lang: TcgLang
  private baseUrl: string

  constructor(baseUrl = DEFAULT_BASE, lang: TcgLang = 'en') {
    this.baseUrl = baseUrl
    this.lang = lang
  }

  private url(path: string) {
    return `${this.baseUrl}/${toApiLang(this.lang)}${path}`
  }

  async getSeries(): Promise<ExternalSerie[]> {
    const rows = await fetchJson<Array<{ id: string; name: string; logo?: string; releaseDate?: string }>>(
      this.url('/series'),
    )
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.logo,
      releaseDate: s.releaseDate,
    }))
  }

  async getSets(): Promise<ExternalSet[]> {
    const rows = await fetchJson<
      Array<{
        id: string
        name: string
        logo?: string
        symbol?: string
        cardCount?: { total?: number; official?: number }
        releaseDate?: string
        serie?: { id?: string; name?: string }
      }>
    >(this.url('/sets'))
    return rows.map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.logo,
      symbol: s.symbol,
      cardCount: s.cardCount,
      releaseDate: s.releaseDate,
      serieId: s.serie?.id,
      serieName: s.serie?.name,
    }))
  }

  async getCards(setId: string): Promise<ExternalCardSummary[]> {
    const set = await fetchJson<{ cards?: ExternalCardSummary[] }>(this.url(`/sets/${setId}`))
    return (set.cards ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      localId: String(c.localId),
      image: c.image,
      setId,
    }))
  }

  async getCard(cardId: string, lang?: string): Promise<ExternalCard | null> {
    const L = lang ? toApiLang(lang) : this.lang
    try {
      const raw = await fetchJson<Record<string, unknown>>(
        `${this.baseUrl}/${L}/cards/${cardId}`,
      )
      if (!raw?.id) return null
      return mapExternalCard(raw)
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 404) return null
      throw err
    }
  }
}

function mapExternalCard(raw: Record<string, unknown>): ExternalCard {
  const set = raw.set as { id?: string; name?: string } | undefined
  return {
    id: String(raw.id),
    name: String(raw.name ?? ''),
    localId: String(raw.localId ?? ''),
    image: raw.image as string | undefined,
    set,
    category: raw.category as string | undefined,
    stage: raw.stage as string | undefined,
    trainerType: raw.trainerType as string | undefined,
    energyType: raw.energyType as string | undefined,
    effect: raw.effect as string | undefined,
    hp: raw.hp as number | undefined,
    types: raw.types as string[] | undefined,
    dexId: raw.dexId as number[] | undefined,
    rarity: raw.rarity as string | undefined,
    illustrator: raw.illustrator as string | undefined,
    regulationMark: raw.regulationMark as string | undefined,
    legal: raw.legal as ExternalCard['legal'],
    variants: raw.variants as Record<string, boolean> | undefined,
    variants_detailed: raw.variants_detailed as ExternalCard['variants_detailed'],
    pricing: raw.pricing as Record<string, unknown> | undefined,
    attacks: raw.attacks as ExternalCard['attacks'],
    weaknesses: raw.weaknesses as ExternalCard['weaknesses'],
    resistances: raw.resistances as ExternalCard['resistances'],
    abilities: raw.abilities as ExternalCard['abilities'],
    evolveFrom: raw.evolveFrom as string | undefined,
    description: raw.description as string | undefined,
    raw,
  }
}

export function createTcgdexSources(langs: TcgLang[] = ['en', 'pt']): TcgdexApiSource[] {
  return langs.map((lang) => new TcgdexApiSource(DEFAULT_BASE, lang))
}
