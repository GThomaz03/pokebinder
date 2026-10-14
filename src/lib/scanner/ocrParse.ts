/**
 * Collector-number parsing adapted from pokeum `app/signals/ocr.py` (MIT).
 * The OCR engine is injected; RapidOCR stays on the Python side of pokeum.
 */
import type { OcrObservation } from './types'

const DIGIT_LOOKALIKES: Record<string, string> = {
  O: '0',
  o: '0',
  I: '1',
  l: '1',
  '|': '1',
}

const NUMBER_RE = /(\d{1,4})\s*[/|]\s*(\d{1,4})/
const GLUED_RE = /(?:^|[^\d])(\d{3})\s*(\d{3})(?:[^\d]|$)/
const SET_CODE_RE = /\b([A-Z]{2,4})\b/g
const SET_CODE_STOPWORDS = new Set(['EN', 'HP', 'LV', 'NO', 'GX', 'EX', 'GG', 'TG'])

function translateLookalikes(text: string): string {
  let out = ''
  for (const ch of text) out += DIGIT_LOOKALIKES[ch] ?? ch
  return out
}

export function parseCollectorNumber(text: string): { number: string | null; total: number | null } {
  const digitized = translateLookalikes(text)
  const slash = NUMBER_RE.exec(digitized)
  if (slash) return normalizePair(slash[1], slash[2])
  const fromToken = parseDigitToken(digitized)
  if (fromToken.number) return fromToken
  const glued = GLUED_RE.exec(digitized)
  if (glued) return normalizePair(glued[1], glued[2])
  return { number: null, total: null }
}

/** A slash often becomes 7 when only digits are read: 037/084 → 0377084. */
function parseDigitToken(text: string): { number: string | null; total: number | null } {
  const tokens = text.match(/\d{6,8}/g) ?? []
  for (const token of tokens) {
    if (token.length === 7 && (token[3] === '7' || token[3] === '1')) {
      const parsed = normalizePair(token.slice(0, 3), token.slice(4))
      if (parsed.number) return parsed
    }
  }
  for (const token of tokens) {
    if (token.length === 6) {
      const parsed = normalizePair(token.slice(0, 3), token.slice(3))
      if (parsed.number) return parsed
    }
  }
  return { number: null, total: null }
}

function normalizePair(rawNumber: string, rawTotal: string): { number: string | null; total: number | null } {
  const total = Number(rawTotal)
  const number = Number(rawNumber)
  if (!Number.isFinite(total) || !Number.isFinite(number)) return { number: null, total: null }
  if (total < 20 || total > 400 || number < 1 || number > 999) return { number: null, total: null }
  return { number: String(number), total }
}

export function parseSetCode(text: string): string | null {
  SET_CODE_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SET_CODE_RE.exec(text))) {
    const candidate = match[1]
    if (candidate && !SET_CODE_STOPWORDS.has(candidate)) return candidate
  }
  return null
}

export function interpretLines(lines: Array<{ text: string; confidence: number }>): OcrObservation {
  const raw = lines
    .map((line) => line.text)
    .join(' ')
    .trim()
  const ranked = [...lines].sort((a, b) => collectorLineScore(b) - collectorLineScore(a))
  const best = ranked.find((line) => collectorLineScore(line) > 0)
  if (best) {
    const parsed = parseCollectorNumber(best.text)
    return {
      rawText: raw,
      number: parsed.number,
      numberTotal: parsed.total,
      setCode: parseSetCode(raw),
      confidence: best.confidence,
      isUseful: parsed.number !== null && best.confidence > 0,
    }
  }
  const parsed = parseCollectorNumber(raw)
  const confidence = ranked.reduce((max, line) => Math.max(max, line.confidence), 0)
  return {
    rawText: raw,
    number: parsed.number,
    numberTotal: parsed.total,
    setCode: parseSetCode(raw),
    confidence,
    isUseful: parsed.number !== null && confidence > 0,
  }
}

function collectorLineScore(line: { text: string; confidence: number }): number {
  if (!parseCollectorNumber(line.text).number) return 0
  const slash = /\d\s*\/\s*\d/.test(translateLookalikes(line.text))
  return (slash ? 10 : 4) + line.confidence
}
