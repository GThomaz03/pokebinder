import { useEffect, useState } from 'react'
import { searchCardsRepo } from '../../api/cards/cardRepository'
import { useLanguage } from '../../hooks/useLanguage'
import { selectedCandidate, statusLabel, type QueueItem } from '../../lib/scanner/queue'
import type { ScoredCard } from '../../lib/scanner/types'

type Props = {
  items: QueueItem[]
  onChange: (items: QueueItem[]) => void
  onRetry: (id: string) => void
  onConfirm: () => void
  confirming: boolean
  onBack: () => void
}

export function ScanReview({ items, onChange, onRetry, onConfirm, confirming, onBack }: Props) {
  const included = items.filter((item) => item.include && item.selectedId && !item.saved)
  const copies = included.reduce((sum, item) => sum + item.qty, 0)
  const needsReview = items.filter((item) => !item.include).length

  function patch(id: string, partial: Partial<QueueItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...partial } : item)))
  }

  return (
    <section className="scan-review">
      <header className="scan-review-head">
        <button type="button" className="scan-text-btn" onClick={onBack}>
          Voltar à captura
        </button>
        <div>
          <h2>Fila de revisão</h2>
          <p>
            {items.length === 1 ? '1 recorte' : `${items.length} recortes`} · {needsReview} para revisar ·{' '}
            {copies === 1 ? '1 cópia pronta' : `${copies} cópias prontas`}
          </p>
        </div>
      </header>

      {items.length === 0 ? (
        <p className="scan-empty">A fila está vazia. Escaneie uma carta ou envie uma foto.</p>
      ) : (
        <ul className="scan-grid">
          {items.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              onPatch={(partial) => patch(item.id, partial)}
              onRemove={() => onChange(items.filter((row) => row.id !== item.id))}
              onRetry={() => onRetry(item.id)}
            />
          ))}
        </ul>
      )}

      <footer className="scan-review-foot">
        <p>
          Nada entra no repositório antes desta confirmação. Um segundo clique não soma de novo as mesmas
          cópias.
        </p>
        <button
          type="button"
          className="scan-primary"
          disabled={confirming || copies === 0}
          onClick={onConfirm}
        >
          {confirming ? 'Adicionando…' : `Adicionar ${copies} ao repositório`}
        </button>
      </footer>
    </section>
  )
}

function ReviewCard({
  item,
  onPatch,
  onRemove,
  onRetry,
}: {
  item: QueueItem
  onPatch: (partial: Partial<QueueItem>) => void
  onRemove: () => void
  onRetry: () => void
}) {
  const chosen = selectedCandidate(item)
  const [open, setOpen] = useState(item.status !== 'confident')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ScoredCard[]>([])
  const [searching, setSearching] = useState(false)
  const { lang } = useLanguage()

  useEffect(() => {
    const text = query.trim()
    if (text.length < 2) return
    const timer = window.setTimeout(() => {
      setSearching(true)
      void searchCardsRepo(lang, text)
        .then((rows) => {
          setHits(
            rows.slice(0, 8).map((row) => ({
              id: row.id,
              name: row.name,
              localId: String(row.localId),
              setId: row.setId,
              image: row.image,
              confidence: 0,
            })),
          )
        })
        .catch(() => setHits([]))
        .finally(() => setSearching(false))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [query, lang])

  function choose(card: ScoredCard) {
    const exists = item.candidates.some((candidate) => candidate.id === card.id)
    onPatch({
      selectedId: card.id,
      include: true,
      candidates: exists ? item.candidates : [card, ...item.candidates],
    })
  }

  return (
    <li className={`scan-tile is-${item.status}`}>
      <img src={item.cropUrl} alt="" />
      <div className="scan-tile-body">
        <span className={`scan-badge is-${item.saved ? 'confident' : item.status}`}>
          {item.saved ? 'No repositório' : statusLabel(item)}
        </span>
        <strong>{chosen?.name ?? 'Carta não escolhida'}</strong>
        <span className="scan-meta">
          {chosen ? `#${chosen.localId}${chosen.setName ? ` · ${chosen.setName}` : chosen.setId ? ` · ${chosen.setId}` : ''}` : item.ocrRaw || 'Sem leitura do número'}
        </span>
        {chosen && chosen.confidence > 0 && (
          <span className="scan-meta">Confiança {Math.round(chosen.confidence * 100)} / 100</span>
        )}
        <label className="scan-check">
          <input
            type="checkbox"
            checked={item.include && !item.saved}
            disabled={item.saved}
            onChange={(event) => onPatch({ include: event.target.checked })}
          />
          {item.saved ? 'Já adicionada' : 'Incluir no repositório'}
        </label>
        <div className="scan-qty">
          <button type="button" onClick={() => onPatch({ qty: Math.max(1, item.qty - 1) })} aria-label="Diminuir quantidade">
            −
          </button>
          <input
            type="number"
            min={1}
            max={99}
            value={item.qty}
            aria-label="Quantidade"
            onChange={(event) => onPatch({ qty: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })}
          />
          <button type="button" onClick={() => onPatch({ qty: Math.min(99, item.qty + 1) })} aria-label="Aumentar quantidade">
            +
          </button>
        </div>
        <div className="scan-tile-actions">
          <button type="button" className="scan-text-btn" onClick={() => setOpen((value) => !value)}>
            {open ? 'Fechar candidatos' : 'Corrigir'}
          </button>
          <button type="button" className="scan-text-btn" onClick={onRetry}>
            Tentar de novo
          </button>
          <button type="button" className="scan-text-btn is-danger" onClick={onRemove}>
            Remover
          </button>
        </div>
        {open && (
          <div className="scan-candidates">
            <ul>
              {item.candidates.map((candidate) => (
                <li key={candidate.id}>
                  <button
                    type="button"
                    className={candidate.id === item.selectedId ? 'is-selected' : ''}
                    onClick={() => choose(candidate)}
                  >
                    {candidate.image && <img src={candidate.image} alt="" />}
                    <span>
                      {candidate.name}
                      <small>
                        #{candidate.localId}
                        {candidate.setName ? ` · ${candidate.setName}` : ''}
                        {candidate.confidence > 0 ? ` · ${Math.round(candidate.confidence * 100)}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {item.candidates.length === 0 && <p>Nenhum candidato automático.</p>}
            <label>
              Busca manual
              <input
                type="search"
                value={query}
                placeholder="Nome ou número"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {searching && <p>Buscando no catálogo…</p>}
            <ul>
              {hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" onClick={() => choose(hit)}>
                    <span>
                      {hit.name}
                      <small>
                        #{hit.localId}
                        {hit.setId ? ` · ${hit.setId}` : ''}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  )
}
