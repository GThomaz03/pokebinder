import type { ArtHit, CardCandidate, OcrHit, ScanOutcome } from './types'

/** Cosine similarity thresholds for MobileCLIP card matches (normalized embeddings). */
const VISION_STRONG = 0.28
const VISION_OK = 0.22
const MARGIN = 0.03

export function outcomeFromVision(
  hits: ArtHit[],
  ocr?: OcrHit | null,
): ScanOutcome {
  if (!hits.length) {
    return { kind: 'manual', reason: 'none', ocr: ocr ?? undefined }
  }

  let ranked = [...hits]

  // OCR tie-break: boost candidates matching localId / setId / name
  if (ocr && (ocr.localId || ocr.setId || ocr.nameHint || ocr.cardId)) {
    ranked = ranked
      .map((h) => {
        let boost = 0
        if (ocr.cardId && h.cardId === ocr.cardId) boost += 0.08
        if (ocr.setId && h.setId === ocr.setId) boost += 0.03
        if (ocr.localId && String(Number(h.localId)) === String(Number(ocr.localId))) boost += 0.04
        if (ocr.nameHint && h.name?.toLowerCase().includes(ocr.nameHint.toLowerCase())) boost += 0.05
        return { ...h, score: h.score + boost }
      })
      .sort((a, b) => b.score - a.score)
  }

  const top = ranked[0]!
  const second = ranked[1]
  const margin = second ? top.score - second.score : 1

  if (top.score >= VISION_STRONG && margin >= MARGIN) {
    return {
      kind: 'identified',
      identity: {
        cardId: top.cardId,
        source: ocr?.cardId === top.cardId ? 'hybrid' : 'art',
        artScore: top.score,
        ocrConfidence: ocr?.confidence,
      },
    }
  }

  if (top.score >= VISION_OK) {
    const candidates: CardCandidate[] = ranked.slice(0, 5).map((h) => ({
      cardId: h.cardId,
      name: h.name ?? h.cardId,
      localId: h.localId ?? '',
      setId: h.setId ?? '',
      image: h.image,
      confidence: h.score,
      reason: 'vision',
      visionScore: h.score,
    }))
    return { kind: 'candidates', candidates, ocr: ocr ?? { confidence: 0, raw: '' } }
  }

  return { kind: 'manual', reason: 'weak', ocr: ocr ?? undefined }
}

/** @deprecated */
export function outcomeFromCandidates(
  candidates: CardCandidate[],
  ocr: OcrHit,
): ScanOutcome {
  if (!candidates.length) return { kind: 'manual', reason: 'none', ocr }
  const hits: ArtHit[] = candidates.map((c) => ({
    cardId: c.cardId,
    score: c.visionScore ?? c.confidence,
    name: c.name,
    localId: c.localId,
    setId: c.setId,
    image: c.image,
  }))
  return outcomeFromVision(hits, ocr)
}

export class ScanDedupe {
  private lockedCardId: string | null = null
  private lockedTrackId: number | null = null
  private processedTracks = new Set<number>()
  private recentAt = new Map<string, number>()

  onTrackLost() {
    this.lockedCardId = null
    this.lockedTrackId = null
  }

  shouldIdentify(trackId: number): boolean {
    if (this.processedTracks.has(trackId)) return false
    if (this.lockedTrackId === trackId && this.lockedCardId) return false
    return true
  }

  markIdentified(trackId: number, cardId: string) {
    this.processedTracks.add(trackId)
    this.lockedTrackId = trackId
    this.lockedCardId = cardId
    this.recentAt.set(cardId, Date.now())
  }

  releaseTrack(trackId: number) {
    this.processedTracks.delete(trackId)
    if (this.lockedTrackId === trackId) {
      this.lockedTrackId = null
      this.lockedCardId = null
    }
  }

  lockAfterAdd(cardId: string, trackId: number) {
    this.lockedCardId = cardId
    this.lockedTrackId = trackId
    this.recentAt.set(cardId, Date.now())
  }

  allowAnother(cardId: string) {
    this.recentAt.delete(cardId)
  }

  isRecentDuplicate(cardId: string, windowMs = 2000): boolean {
    const t = this.recentAt.get(cardId)
    if (!t) return false
    return Date.now() - t < windowMs
  }

  resetSession() {
    this.lockedCardId = null
    this.lockedTrackId = null
    this.processedTracks.clear()
    this.recentAt.clear()
  }
}
