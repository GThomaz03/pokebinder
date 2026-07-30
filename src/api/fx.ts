/** Exchange rates for converting market prices to BRL. */

const FX_KEY = 'pokebinder-fx-v1'
const TTL_MS = 1000 * 60 * 60 * 6

type FxCache = {
  updated: number
  eurToBrl: number
  usdToBrl: number
}

let memory: FxCache | null = null

function load(): FxCache | null {
  try {
    const raw = localStorage.getItem(FX_KEY)
    if (!raw) return null
    return JSON.parse(raw) as FxCache
  } catch {
    return null
  }
}

function save(fx: FxCache) {
  memory = fx
  localStorage.setItem(FX_KEY, JSON.stringify(fx))
}

/** Fallback approx rates if network fails */
const FALLBACK: FxCache = {
  updated: 0,
  eurToBrl: 5.8,
  usdToBrl: 5.1,
}

export async function getFxRates(): Promise<FxCache> {
  const cached = memory ?? load()
  if (cached && Date.now() - cached.updated < TTL_MS) return cached

  try {
    const [eurRes, usdRes] = await Promise.all([
      fetch('https://open.er-api.com/v6/latest/EUR'),
      fetch('https://open.er-api.com/v6/latest/USD'),
    ])
    const eurJson = (await eurRes.json()) as { rates?: { BRL?: number } }
    const usdJson = (await usdRes.json()) as { rates?: { BRL?: number } }
    const fx: FxCache = {
      updated: Date.now(),
      eurToBrl: eurJson.rates?.BRL ?? FALLBACK.eurToBrl,
      usdToBrl: usdJson.rates?.BRL ?? FALLBACK.usdToBrl,
    }
    save(fx)
    return fx
  } catch {
    return cached ?? FALLBACK
  }
}

export function toBrl(
  amount: number | null | undefined,
  currency: 'EUR' | 'USD',
  fx: FxCache,
): number | null {
  if (amount == null) return null
  const rate = currency === 'EUR' ? fx.eurToBrl : fx.usdToBrl
  return amount * rate
}
