/** Persists which image URL actually loaded for a card/src, so remounts skip failed candidates. */

import { API_CONFIG } from './config'
import { isLegacyCatalogImage } from './images/imageProvider'

const STORAGE_KEY = API_CONFIG.storageKeys.imageUrls
const LEGACY_STORAGE_KEYS = ['pokebinder-img-urls-v1', 'pokebinder-img-urls-v3']

type ImageUrlMap = Record<string, string>

function shouldDropImageUrl(url: string): boolean {
  return isLegacyCatalogImage(url)
}

function load(): ImageUrlMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = (JSON.parse(raw) as ImageUrlMap) ?? {}
      let changed = false
      const next: ImageUrlMap = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== 'string' || shouldDropImageUrl(v)) {
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
    }

    // One-time reset: drop legacy caches that stored TCGdex card-back URLs.
    for (const legacyKey of LEGACY_STORAGE_KEYS) {
      try {
        localStorage.removeItem(legacyKey)
      } catch {
        /* ignore */
      }
    }
    return {}
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
  const src = parts.src?.trim()
  const cardId = parts.cardId?.trim()
  // Prefer resolved API URLs — cardId-only keys kept stale inferred URLs (often TCGdex card backs).
  if (src && !isLegacyCatalogImage(src)) {
    return `${src}::${parts.quality}`
  }
  const id = cardId || src || ''
  return `${id}::${parts.quality}`
}

export function getCachedImageUrl(key: string): string | undefined {
  if (!key || key === '::high' || key === '::low') return undefined
  const url = cache[key]
  if (url && isLegacyCatalogImage(url)) {
    clearCachedImageUrl(key, url)
    return undefined
  }
  return url
}

export function setCachedImageUrl(key: string, url: string) {
  if (!key || !url || isLegacyCatalogImage(url)) return
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
