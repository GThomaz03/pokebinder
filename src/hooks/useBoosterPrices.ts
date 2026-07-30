import { useCallback, useEffect, useState } from 'react'
import { getSealedSet, SEALED_SETS } from '../data/sealed/sets'

const STORAGE_KEY = 'pokebinder-booster-prices-v1'

type PriceMap = Record<string, number>

function loadOverrides(): PriceMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: PriceMap = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function saveOverrides(map: PriceMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
  } catch {
    /* ignore quota */
  }
}

export function useBoosterPrices() {
  const [overrides, setOverrides] = useState<PriceMap>(() => loadOverrides())

  useEffect(() => {
    saveOverrides(overrides)
  }, [overrides])

  const getDefaultPrice = useCallback((setId: string): number => {
    return getSealedSet(setId)?.defaultBoosterPriceBrl ?? 0
  }, [])

  const getPrice = useCallback(
    (setId: string): number => {
      return overrides[setId] ?? getDefaultPrice(setId)
    },
    [overrides, getDefaultPrice],
  )

  const hasOverride = useCallback(
    (setId: string): boolean => overrides[setId] != null,
    [overrides],
  )

  const setPrice = useCallback((setId: string, value: number) => {
    if (!Number.isFinite(value) || value <= 0) return
    setOverrides((prev) => {
      const def = getSealedSet(setId)?.defaultBoosterPriceBrl
      if (def != null && Math.abs(value - def) < 0.005) {
        if (!(setId in prev)) return prev
        const next = { ...prev }
        delete next[setId]
        return next
      }
      if (prev[setId] === value) return prev
      return { ...prev, [setId]: value }
    })
  }, [])

  const resetPrice = useCallback((setId: string) => {
    setOverrides((prev) => {
      if (!(setId in prev)) return prev
      const next = { ...prev }
      delete next[setId]
      return next
    })
  }, [])

  const resetAll = useCallback(() => setOverrides({}), [])

  return {
    sets: SEALED_SETS,
    getPrice,
    getDefaultPrice,
    hasOverride,
    setPrice,
    resetPrice,
    resetAll,
  }
}
