/** Persists which image URL actually loaded for a card/src, so remounts skip failed candidates. */

const STORAGE_KEY = 'pokebinder-img-urls-v1'

type ImageUrlMap = Record<string, string>

function load(): ImageUrlMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    return (JSON.parse(raw) as ImageUrlMap) ?? {}
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
