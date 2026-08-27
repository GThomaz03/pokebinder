import { API_CONFIG } from '../config'

const CACHE_MS = 45_000
const PROBE_TIMEOUT_MS = 3_000

let cached: { ok: boolean; at: number } | null = null
let inflight: Promise<boolean> | null = null

export function isTcgdexApiUrl(url: string): boolean {
  return /api\.tcgdex\.net/i.test(url) || /\/api\/tcgdex(\/|\?|$)/i.test(url)
}

/** Cached probe result without network — `null` when stale / unknown. */
export function getCachedTcgdexAvailability(): boolean | null {
  if (!cached) return null
  if (Date.now() - cached.at >= CACHE_MS) return null
  return cached.ok
}

/** Record a failed origin so callers skip further TCGdex traffic for CACHE_MS. */
export function markTcgdexUnavailable() {
  cached = { ok: false, at: Date.now() }
}

/**
 * Lightweight probe of TCGdex. Result is cached briefly so search keystrokes
 * do not hammer a downed origin.
 */
export async function isTcgdexAvailable(): Promise<boolean> {
  const hit = getCachedTcgdexAvailability()
  if (hit !== null) return hit
  if (inflight) return inflight

  inflight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    try {
      const res = await fetch(`${API_CONFIG.tcgdex.baseUrl}/en/series`, {
        signal: controller.signal,
        method: 'GET',
      })
      const ok = res.ok
      cached = { ok, at: Date.now() }
      return ok
    } catch {
      cached = { ok: false, at: Date.now() }
      return false
    } finally {
      clearTimeout(timer)
      inflight = null
    }
  })()

  return inflight
}

/** Force the next call to re-probe (e.g. after an explicit user retry). */
export function resetTcgdexHealthCache() {
  cached = null
}
