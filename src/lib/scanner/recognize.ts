import { DEFAULT_TOP_K, SIGNAL_HASH, VISUAL_COMPARE_LIMIT } from './constants'
import { fuse } from './fusion'
import { computeHashes, hashSimilarity } from './hash'
import { interpretLines } from './ocrParse'
import type { HashFamily, OcrObservation, Raster, Recognition, RecognizeDeps, ScanCard, ScoredCard } from './types'

const FUSION_TO_STATUS = {
  CONFIDENT: 'confident',
  UNCERTAIN: 'uncertain',
  NO_MATCH: 'none',
} as const

function sameCollector(card: ScanCard, number: string): boolean {
  const digits = card.localId.replace(/\D/g, '')
  if (!digits) return false
  return String(Number(digits)) === String(Number(number))
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return out
}

export async function identifyCrop(crop: Raster, deps: RecognizeDeps): Promise<Recognition> {
  const started = now()
  const timings: Record<string, number> = {}
  try {
    const ocrStarted = now()
    const lines = await deps.readLines(crop)
    const ocr = interpretLines(lines.map((line) => ({ text: line.text, confidence: normalizeConfidence(line.confidence) })))
    timings.ocr = now() - ocrStarted

    const hashStarted = now()
    const hashes = computeHashes(crop)
    timings.hash = now() - hashStarted

    if (ocr.number) {
      const lookupStarted = now()
      const found = await deps.lookupByCollector({
        number: ocr.number,
        total: ocr.numberTotal,
        setCode: ocr.setCode,
        lang: deps.lang,
      })
      timings.lookup = now() - lookupStarted
      if (found.length) {
        const visual = await scoreReferences(hashes, found.slice(0, VISUAL_COMPARE_LIMIT), deps)
        timings.visual = visual.ms
        if (!visual.scores.length) {
          return finish(
            'uncertain',
            'no-visual',
            null,
            found.slice(0, DEFAULT_TOP_K).map((card) => ({ ...card, confidence: 0 })),
            ocr.rawText,
            timings,
            started,
          )
        }
        const recognized = finishFused(visual.cards, visual.scores, ocr, timings, started)
        if (recognized.status === 'none' && (recognized.candidates.length || found.length)) {
          const candidates = recognized.candidates.length
            ? recognized.candidates
            : found.slice(0, DEFAULT_TOP_K).map((card) => ({ ...card, confidence: 0 }))
          return finish('uncertain', 'weak', null, candidates, ocr.rawText, timings, started)
        }
        return recognized
      }
    }

    const indexStarted = now()
    const indexHits = deps.queryVisualIndex ? await deps.queryVisualIndex(hashes) : []
    timings.index = now() - indexStarted
    if (indexHits.length) {
      return finishFused(
        indexHits.map((hit) => hit.card),
        indexHits.map((hit) => ({ cardId: hit.card.id, score: hit.score })),
        ocr,
        timings,
        started,
      )
    }

    if (ocr.number) return finish('none', 'catalog-empty', null, [], ocr.rawText, timings, started)
    return finish('none', 'no-number', null, [], ocr.rawText, timings, started)
  } catch (err) {
    console.warn('[scanner] identify failed', err)
    return finish('failed', 'error', null, [], '', timings, started)
  }
}

function finishFused(
  cards: ScanCard[],
  scores: Array<{ cardId: string; score: number }>,
  ocr: OcrObservation,
  timings: Record<string, number>,
  started: number,
): Recognition {
  const consistent = new Set(
    ocr.number ? cards.filter((card) => sameCollector(card, ocr.number as string)).map((card) => card.id) : [],
  )
  const fused = fuse({ [SIGNAL_HASH]: scores }, ocr, consistent)
  const byId = new Map(cards.map((card) => [card.id, card]))
  const candidates: ScoredCard[] = []
  for (const row of fused.candidates) {
    const card = byId.get(row.cardId)
    if (!card) continue
    candidates.push({ ...card, confidence: row.confidence })
  }
  const status = FUSION_TO_STATUS[fused.status]
  const reason = status === 'confident' ? 'ok' : 'weak'
  return finish(status, reason, candidates[0] ?? null, candidates, ocr.rawText, timings, started)
}

async function scoreReferences(
  hashes: HashFamily,
  cards: ScanCard[],
  deps: RecognizeDeps,
): Promise<{ cards: ScanCard[]; scores: Array<{ cardId: string; score: number }>; ms: number }> {
  const started = now()
  const scored = await mapPool(cards, 4, async (card) => {
    const reference = await deps.loadReference(card)
    if (!reference) return null
    return { card, score: hashSimilarity(hashes, computeHashes(reference)) }
  })
  const usable = scored.filter((row): row is { card: ScanCard; score: number } => row !== null)
  return {
    cards: usable.map((row) => row.card),
    scores: usable.map((row) => ({ cardId: row.card.id, score: row.score })),
    ms: now() - started,
  }
}

function finish(
  status: Recognition['status'],
  reason: Recognition['reason'],
  card: Recognition['card'],
  candidates: ScoredCard[],
  ocrRaw: string,
  timingsMs: Record<string, number>,
  started: number,
): Recognition {
  timingsMs.total = now() - started
  const result = { status, reason, card: status === 'none' || status === 'failed' ? null : card, candidates, ocrRaw, timingsMs }
  console.info('[scanner]', {
    status: result.status,
    reason: result.reason,
    ms: Math.round(timingsMs.total),
    candidates: candidates.length,
    ocr: ocrRaw.slice(0, 80),
  })
  return result
}

function normalizeConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value > 1) return Math.max(0, Math.min(1, value / 100))
  return Math.max(0, Math.min(1, value))
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}
