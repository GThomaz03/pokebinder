import { API_CONFIG } from '../config'
import { fetchJson } from '../cards/http'
import type { FxRates } from './types'

const FX_KEY = API_CONFIG.storageKeys.fx
const TTL_MS = API_CONFIG.cache.fxStaleTimeMs

let memory: FxRates | null = null

function load(): FxRates | null {
  try {
    const raw = localStorage.getItem(FX_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as FxRates
    if (!parsed.eurToBrl || !parsed.usdToBrl) return null
    return { ...parsed, source: parsed.source ?? 'cache' }
  } catch {
    return null
  }
}

function save(fx: FxRates) {
  memory = fx
  try {
    localStorage.setItem(FX_KEY, JSON.stringify(fx))
  } catch {
    /* quota */
  }
}

const FALLBACK: FxRates = {
  updated: 0,
  eurToBrl: API_CONFIG.fx.fallbackEurToBrl,
  usdToBrl: API_CONFIG.fx.fallbackUsdToBrl,
  source: 'fallback',
}

/** Fetch FX on demand — no module-load warm-up. */
export async function getFxRates(force = false): Promise<FxRates> {
  const cached = memory ?? load()
  if (!force && cached && Date.now() - cached.updated < TTL_MS) {
    return { ...cached, source: cached.source === 'live' ? 'cache' : cached.source }
  }

  try {
    const [eurJson, usdJson] = await Promise.all([
      fetchJson<{ rates?: { BRL?: number } }>(API_CONFIG.fx.eurUrl),
      fetchJson<{ rates?: { BRL?: number } }>(API_CONFIG.fx.usdUrl),
    ])
    const fx: FxRates = {
      updated: Date.now(),
      eurToBrl: eurJson.rates?.BRL ?? FALLBACK.eurToBrl,
      usdToBrl: usdJson.rates?.BRL ?? FALLBACK.usdToBrl,
      source: 'live',
    }
    save(fx)
    return fx
  } catch {
    if (cached) return { ...cached, source: 'cache' }
    return FALLBACK
  }
}

export function getCachedFxRates(): FxRates {
  return memory ?? load() ?? FALLBACK
}

export function toBrl(
  amount: number | null | undefined,
  currency: 'EUR' | 'USD',
  fx: Pick<FxRates, 'eurToBrl' | 'usdToBrl'>,
): number | null {
  if (amount == null) return null
  const rate = currency === 'EUR' ? fx.eurToBrl : fx.usdToBrl
  return amount * rate
}
