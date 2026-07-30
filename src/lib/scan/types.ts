export type ScanBox = {
  x: number
  y: number
  w: number
  h: number
  score: number
}

export type TrackedCard = {
  box: ScanBox
  trackId: number
  stableFrames: number
}

export type OcrHit = {
  setId?: string
  localId?: string
  /** Printed set size from NNN/MMM, e.g. 94 from 009/094 */
  setTotal?: number
  /** Best-effort Pokémon / card name from top of card */
  nameHint?: string
  cardId?: string
  confidence: number
  raw: string
  engine?: 'textDetector' | 'tesseract'
}

export type CardCandidate = {
  cardId: string
  name: string
  localId: string
  setId: string
  setName?: string
  image?: string
  confidence: number
  reason: string
  visionScore?: number
}

export type ArtHit = {
  cardId: string
  score: number
  name?: string
  localId?: string
  setId?: string
  image?: string
}

export type ScanResolveResult = {
  ocr: OcrHit
  candidates: CardCandidate[]
}

export type IdentitySource = 'hybrid' | 'art' | 'ocr' | 'manual'

export type ScanIdentity = {
  cardId: string
  source: IdentitySource
  artScore?: number
  ocrConfidence?: number
}

export type ScanOutcome =
  | { kind: 'identified'; identity: ScanIdentity }
  | { kind: 'candidates'; candidates: CardCandidate[]; ocr: OcrHit }
  | { kind: 'manual'; reason: 'conflict' | 'weak' | 'none'; ocr?: OcrHit }
  | { kind: 'skip' }

export type EmbeddingCard = {
  id: string
  name: string
  localId: string
  setId: string
  image?: string
}

export type EmbeddingIndex = {
  dim: number
  cards: EmbeddingCard[]
  /** Flat Float32Array length = cards.length * dim */
  vectors: Float32Array
}

export type SetIndex = {
  abbr: Record<string, string>
  byOfficial: Record<string, string[]>
  sets: Array<{ id: string; name: string; official: number; total: number }>
}
