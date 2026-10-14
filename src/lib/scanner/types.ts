import type { CardLang } from '../../types'

export type Point = { x: number; y: number }

export type Raster = {
  data: Uint8ClampedArray
  width: number
  height: number
}

export type ScanCard = {
  id: string
  name: string
  localId: string
  setId?: string
  setName?: string
  image?: string
  language?: string
  setTotal?: number
}

export type ScoredCard = ScanCard & {
  confidence: number
}

export type ScanStatus = 'confident' | 'uncertain' | 'none' | 'failed'

export type ScanReason =
  | 'ok'
  | 'weak'
  | 'no-number'
  | 'no-visual'
  | 'catalog-empty'
  | 'error'
  | 'no-card'

export type OcrObservation = {
  rawText: string
  number: string | null
  numberTotal: number | null
  setCode: string | null
  confidence: number
  isUseful: boolean
}

export type Recognition = {
  status: ScanStatus
  reason: ScanReason
  card: ScanCard | null
  candidates: ScoredCard[]
  ocrRaw: string
  timingsMs: Record<string, number>
}

export type PreparedCrop = {
  raster: Raster
  quad: Point[] | null
}

export type HashFamily = {
  phash: Uint8Array
  dhash: Uint8Array
  phashR: Uint8Array
  phashG: Uint8Array
  phashB: Uint8Array
}

export type VisualIndexHit = {
  card: ScanCard
  score: number
}

export type RecognizeDeps = {
  readLines: (strip: Raster) => Promise<Array<{ text: string; confidence: number }>>
  lookupByCollector: (query: {
    number: string
    total: number | null
    setCode: string | null
    lang: CardLang
  }) => Promise<ScanCard[]>
  loadReference: (card: ScanCard) => Promise<Raster | null>
  queryVisualIndex?: (hashes: HashFamily) => Promise<VisualIndexHit[]>
  lang: CardLang
}
