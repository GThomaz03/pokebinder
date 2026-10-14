/**
 * Score fusion adapted from pokeum `app/recognize/fusion.py` (MIT).
 * Dense weights renormalize over the signals that actually ran.
 * OCR multiplies; it never deletes a candidate.
 */
import {
  CONFIDENT_MARGIN,
  CONFIDENT_THRESHOLD,
  DEFAULT_TOP_K,
  OCR_BOOST,
  OCR_PENALTY,
  SIGNAL_HASH,
  UNCERTAIN_THRESHOLD,
  WEIGHT_HASH,
} from './constants'
import type { OcrObservation } from './types'

const SIGNAL_WEIGHTS: Record<string, number> = {
  [SIGNAL_HASH]: WEIGHT_HASH,
}

export type SignalScore = { cardId: string; score: number }

export type FusedCandidate = {
  cardId: string
  confidence: number
  perSignal: Record<string, number>
}

export type FusionStatus = 'CONFIDENT' | 'UNCERTAIN' | 'NO_MATCH'

function ocrFactor(cardId: string, ocr: OcrObservation | null, consistent: ReadonlySet<string>): number {
  if (!ocr || !ocr.isUseful || ocr.confidence <= 0) return 1
  if (consistent.has(cardId)) return 1 + OCR_BOOST * ocr.confidence
  return 1 - OCR_PENALTY * ocr.confidence
}

export function fuse(
  dense: Record<string, SignalScore[]>,
  ocr: OcrObservation | null = null,
  ocrConsistentIds: ReadonlySet<string> = new Set(),
  topK = DEFAULT_TOP_K,
): { status: FusionStatus; candidates: FusedCandidate[] } {
  const maps: Record<string, Map<string, number>> = {}
  const present: string[] = []
  for (const [name, scores] of Object.entries(dense)) {
    if (!scores.length || SIGNAL_WEIGHTS[name] === undefined) continue
    const map = new Map<string, number>()
    for (const score of scores) map.set(score.cardId, score.score)
    maps[name] = map
    present.push(name)
  }
  if (!present.length) return { status: 'NO_MATCH', candidates: [] }

  const denom = present.reduce((sum, name) => sum + SIGNAL_WEIGHTS[name], 0)
  const ids = new Set<string>()
  for (const name of present) {
    for (const id of maps[name].keys()) ids.add(id)
  }

  const scored: Array<{ id: string; raw: number; perSignal: Record<string, number> }> = []
  for (const id of ids) {
    const perSignal: Record<string, number> = {}
    let weighted = 0
    for (const name of present) {
      const value = maps[name].get(id) ?? 0
      perSignal[name] = value
      weighted += SIGNAL_WEIGHTS[name] * value
    }
    const raw = (weighted / denom) * ocrFactor(id, ocr, ocrConsistentIds)
    scored.push({ id, raw, perSignal })
  }
  scored.sort((a, b) => b.raw - a.raw)
  const topRaw = scored[0]?.raw ?? 0
  if (topRaw <= 0) return { status: 'NO_MATCH', candidates: [] }

  const quality = Math.min(topRaw, 1)
  const candidates: FusedCandidate[] = []
  for (const row of scored) {
    candidates.push({
      cardId: row.id,
      confidence: (row.raw / topRaw) * quality,
      perSignal: row.perSignal,
    })
    if (candidates.length >= topK) break
  }

  return { status: decide(candidates), candidates }
}

function decide(candidates: FusedCandidate[]): FusionStatus {
  if (!candidates.length) return 'NO_MATCH'
  const top = candidates[0].confidence
  const runner = candidates[1]?.confidence ?? 0
  if (top >= CONFIDENT_THRESHOLD && top - runner >= CONFIDENT_MARGIN) return 'CONFIDENT'
  if (top >= UNCERTAIN_THRESHOLD) return 'UNCERTAIN'
  return 'NO_MATCH'
}
