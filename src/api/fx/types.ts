import type { FxSource } from '../prices/types'

export type FxRates = {
  updated: number
  eurToBrl: number
  usdToBrl: number
  source: FxSource
}
