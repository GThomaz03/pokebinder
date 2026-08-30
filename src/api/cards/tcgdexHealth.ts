import { API_CONFIG, TCGDEX_ORIGIN } from '../config'

import { isCatalogPopulated } from './supabaseCardProvider'

const CACHE_MS = 45_000
const PROBE_TIMEOUT_MS = 3_000
/** Consecutive probe failures before marking TCGdex down. */
const FAIL_THRESHOLD = 2

let cached: { ok: boolean; at: number } | null = null
let inflight: Promise<boolean> | null = null
let consecutiveFailures = 0
let catalogSkipProbe: boolean | null = null

async function shouldSkipTcgdexProbe(): Promise<boolean> {
  if (catalogSkipProbe === null) {
    catalogSkipProbe = await isCatalogPopulated()
  }
  return catalogSkipProbe
}

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
  consecutiveFailures += 1
  if (consecutiveFailures >= FAIL_THRESHOLD) {
    cached = { ok: false, at: Date.now() }
  }
}

/** Call after a successful TCGdex response to clear failure streak. */
export function markTcgdexAvailable() {
  consecutiveFailures = 0
  cached = { ok: true, at: Date.now() }
}

/**
 * Lightweight probe of TCGdex. Result is cached briefly so search keystrokes
 * do not hammer a downed origin.
 */
export async function isTcgdexAvailable(): Promise<boolean> {
  if (await shouldSkipTcgdexProbe()) {
    cached = { ok: false, at: Date.now() }
    return false
  }
  const hit = getCachedTcgdexAvailability()
  if (hit !== null) return hit
  if (inflight) return inflight

  inflight = (async () => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
    const probeUrls =
      typeof window !== 'undefined'
        ? [`${API_CONFIG.tcgdex.baseUrl}/en/series`, `${TCGDEX_ORIGIN}/en/series`]
        : [`${API_CONFIG.tcgdex.baseUrl}/en/series`]

    try {
      for (const probeUrl of probeUrls) {
        try {
          const res = await fetch(probeUrl, {
            signal: controller.signal,
            method: 'GET',
          })
          if (res.ok) {
            markTcgdexAvailable()
            return true
          }
        } catch {
          /* try next URL */
        }
      }
      markTcgdexUnavailable()
      return consecutiveFailures < FAIL_THRESHOLD
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
  consecutiveFailures = 0
}
