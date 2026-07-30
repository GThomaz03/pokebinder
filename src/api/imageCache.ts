/** Persists which image URL actually loaded for a card/src, so remounts skip failed candidates. */

const STORAGE_KEY = 'pokebinder-img-urls-v1'

type ImageUrlMap = Record<string, string>

function load(): ImageUrlMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = (JSON.parse(raw) as ImageUrlMap) ?? {}
    // Drop remembered PokémonTCG.io URLs that used raw TCGdex set ids (e.g. sv03.5 → 404).
    let changed = false
    const next: ImageUrlMap = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && /images\.pokemontcg\.io\/[^/]*\d\.\d\//.test(v)) {
        changed = true
        continue
      }
      next[k] = v
    }
    if (changed) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
    }
    return next
  } catch {
    return {}
  }
}

let cache: ImageUrlMap = load()
let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistSoon() {
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
      /* quota / private mode */
    }
  }, 400)
}

export function imageCacheKey(parts: {
  src?: string | null
  cardId?: string
  quality: 'high' | 'low'
}): string {
  const id = parts.cardId?.trim() || parts.src?.trim() || ''
  return `${id}::${parts.quality}`
}

export function getCachedImageUrl(key: string): string | undefined {
  if (!key || key === '::high' || key === '::low') return undefined
  return cache[key]
}

export function setCachedImageUrl(key: string, url: string) {
  if (!key || !url) return
  if (cache[key] === url) return
  cache = { ...cache, [key]: url }
  persistSoon()
}

/** Drop a remembered URL after it 404s / fails to decode. */
export function clearCachedImageUrl(key: string, url?: string) {
  if (!key) return
  const current = cache[key]
  if (!current) return
  if (url && current !== url) return
  const next = { ...cache }
  delete next[key]
  cache = next
  persistSoon()
}
