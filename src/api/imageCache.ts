/** Persists which image URL actually loaded for a card/src, so remounts skip failed candidates. */

import { API_CONFIG } from './config'
import { isLegacyCatalogImage } from './images/imageProvider'

const STORAGE_KEY = API_CONFIG.storageKeys.imageUrls
const LEGACY_STORAGE_KEY = 'pokebinder-img-urls-v1'

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

    // One-time reset: drop v1 cache that stored TCGdex card-back URLs.
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore */
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
  const id = parts.cardId?.trim() || parts.src?.trim() || ''
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
