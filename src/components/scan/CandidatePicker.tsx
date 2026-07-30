import { CardImage } from '../CardImage'
import type { CardCandidate } from '../../lib/scan/types'
import './CandidatePicker.css'

type Props = {
  candidates: CardCandidate[]
  ocrRaw?: string
  onPick: (cardId: string) => void
  onSearch: () => void
  onDismiss: () => void
}

export function CandidatePicker({ candidates, ocrRaw, onPick, onSearch, onDismiss }: Props) {
  return (
    <aside className="scan-candidates" aria-label="Candidatos">
      <header className="scan-candidates-head">
        <strong>Qual é a carta?</strong>
        <button type="button" className="scan-dismiss" onClick={onDismiss}>
          Fechar
        </button>
      </header>
      {ocrRaw && <p className="scan-ocr-debug">{ocrRaw}</p>}
      <ul className="scan-candidates-list">
        {candidates.map((c) => (
          <li key={c.cardId}>
            <button type="button" className="scan-candidate-btn" onClick={() => onPick(c.cardId)}>
              <span className="scan-candidate-art">
                {c.image ? <CardImage src={c.image} alt="" quality="low" /> : <span className="ph" />}
              </span>
              <span className="scan-candidate-meta">
                <strong>{c.name}</strong>
                <span>
                  #{c.localId}
                  {c.setName ? ` · ${c.setName}` : ` · ${c.setId}`}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button type="button" className="scan-candidates-search" onClick={onSearch}>
        Nenhuma destas — buscar
      </button>
    </aside>
  )
}
