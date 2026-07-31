import type { CardLang } from '../types'
import { getClient } from './tcgdex'

export type SetMeta = {
  id: string
  name: string
  logo?: string
  symbol?: string
  cardCount: number
  releaseDate?: string
  abbreviation?: string
  serieName?: string
}

const metaCache = new Map<string, SetMeta | null>()
const inflight = new Map<string, Promise<SetMeta | null>>()

function cacheKey(lang: CardLang, setId: string) {
  return `${lang}:${setId}`
}

function logoUrl(base?: string): string | undefined {
  if (!base) return undefined
  if (/\.(webp|png|jpg|jpeg)$/i.test(base)) return base
  return `${base}.webp`
}

export async function getSetMeta(lang: CardLang, setId: string): Promise<SetMeta | null> {
  const key = cacheKey(lang, setId)
  if (metaCache.has(key)) return metaCache.get(key) ?? null
  const pending = inflight.get(key)
  if (pending) return pending

  const req = (async () => {
    try {
      const set = await getClient(lang).set.get(setId)
      if (!set?.id) {
        if (lang !== 'en') return getSetMeta('en', setId)
        metaCache.set(key, null)
        return null
      }
      const count = set.cardCount as { official?: number; total?: number } | undefined
      const abbr = (set as { abbreviation?: { official?: string } }).abbreviation?.official
      const meta: SetMeta = {
        id: set.id,
        name: set.name,
        logo: logoUrl(set.logo as string | undefined),
        symbol: logoUrl(set.symbol as string | undefined),
        cardCount: count?.official ?? count?.total ?? 0,
        releaseDate: (set as { releaseDate?: string }).releaseDate,
        abbreviation: abbr,
        serieName: (set as { serie?: { name?: string } }).serie?.name,
      }
      metaCache.set(key, meta)
      if (lang !== 'en') metaCache.set(cacheKey('en', setId), meta)
      return meta
    } catch {
      if (lang !== 'en') return getSetMeta('en', setId)
      metaCache.set(key, null)
      return null
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, req)
  return req
}

export async function getSetsMeta(
  lang: CardLang,
  setIds: string[],
): Promise<Record<string, SetMeta>> {
  const unique = [...new Set(setIds.filter(Boolean))]
  const results = await Promise.all(unique.map((id) => getSetMeta(lang, id)))
  const map: Record<string, SetMeta> = {}
  for (let i = 0; i < unique.length; i++) {
    const meta = results[i]
    if (meta) map[unique[i]!] = meta
  }
  return map
}
