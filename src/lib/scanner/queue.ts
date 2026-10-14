import type { Raster, Recognition, ScanReason, ScanStatus, ScoredCard } from './types'

export type QueueItem = {
  id: string
  cropUrl: string
  crop: Raster
  status: ScanStatus
  reason: ScanReason
  selectedId: string | null
  candidates: ScoredCard[]
  qty: number
  include: boolean
  ocrRaw: string
  saved?: boolean
}

export function queueItemFromRecognition(crop: Raster, recognition: Recognition, cropUrl: string): QueueItem {
  const selected = recognition.status === 'confident' ? recognition.card : null
  return {
    id: crypto.randomUUID(),
    cropUrl,
    crop,
    status: recognition.status,
    reason: recognition.reason,
    selectedId: selected?.id ?? null,
    candidates: recognition.candidates,
    qty: 1,
    include: Boolean(selected),
    ocrRaw: recognition.ocrRaw,
  }
}

export function selectedCandidate(item: QueueItem): ScoredCard | null {
  if (!item.selectedId) return null
  return item.candidates.find((candidate) => candidate.id === item.selectedId) ?? null
}

export function statusLabel(item: Pick<QueueItem, 'status' | 'reason'>): string {
  if (item.status === 'confident') return 'Reconhecida'
  if (item.status === 'failed') return 'Falha'
  if (item.reason === 'no-number') return 'Número ilegível'
  if (item.reason === 'no-visual') return 'Sem comparação visual'
  if (item.reason === 'catalog-empty') return 'Fora do catálogo'
  if (item.status === 'uncertain') return 'Revisar'
  return 'Não identificada'
}
