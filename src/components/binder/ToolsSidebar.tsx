import type { Binder, SlotRef, ToolMode } from '../../types'
import './ToolsSidebar.css'

type Props = {
  binder: Binder
  mode: ToolMode
  onMode: (mode: ToolMode) => void
  selectedCount: number
  search: string
  onSearch: (q: string) => void
  matches: { pageIndex: number; slotIndex: number; label: string }[]
  onJump: (ref: SlotRef) => void
  onReorder: (from: number, to: number) => void
  canReorder: boolean
}

export function ToolsSidebar({
  binder,
  mode,
  onMode,
  selectedCount,
  search,
  onSearch,
  matches,
  onJump,
  onReorder,
  canReorder,
}: Props) {
  return (
    <aside className="tools-side" aria-label="Ferramentas">
      <button
        type="button"
        className={mode === 'select' ? 'active' : ''}
        onClick={() => onMode(mode === 'select' ? 'none' : 'select')}
        title="Selecionar várias"
      >
        <SelectIcon />
        <span>Selecionar</span>
        {selectedCount > 0 && <em>{selectedCount}</em>}
      </button>
      <button
        type="button"
        className={mode === 'overview' ? 'active' : ''}
        onClick={() => onMode(mode === 'overview' ? 'none' : 'overview')}
        title="Visão das páginas"
      >
        <PagesIcon />
        <span>Páginas</span>
      </button>
      <button
        type="button"
        className={mode === 'search' ? 'active' : ''}
        onClick={() => onMode(mode === 'search' ? 'none' : 'search')}
        title="Pesquisar no fichário"
      >
        <SearchIcon />
        <span>Buscar</span>
      </button>

      {mode === 'search' && (
        <div className="tool-panel">
          <input
            type="search"
            placeholder="Nome ou número…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            autoFocus
          />
          <ul>
            {matches.slice(0, 40).map((m) => (
              <li key={`${m.pageIndex}-${m.slotIndex}`}>
                <button type="button" onClick={() => onJump(m)}>
                  {m.label}
                  <small>
                    p.{m.pageIndex + 1} · slot {m.slotIndex + 1}
                  </small>
                </button>
              </li>
            ))}
            {search && matches.length === 0 && <li className="empty">Nenhum resultado</li>}
          </ul>
        </div>
      )}

      {mode === 'overview' && (
        <div className="tool-panel overview">
          {binder.pages.map((p, i) => (
            <div key={p.id} className="page-row">
              <button type="button" className="jump" onClick={() => onJump({ pageIndex: i, slotIndex: 0 })}>
                <strong>{i + 1}</strong>
                <span>{p.label || `Página ${i + 1}`}</span>
              </button>
              {canReorder && (
                <div className="move">
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => onReorder(i, i - 1)}
                    aria-label="Subir página"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={i >= binder.pages.length - 1}
                    onClick={() => onReorder(i, i + 1)}
                    aria-label="Descer página"
                  >
                    ↓
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'select' && (
        <p className="tip">Clique nas cartas para selecionar. Use a bandeja para mover o lote.</p>
      )}
    </aside>
  )
}

function SelectIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h10M4 12h16M4 17h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function PagesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      <rect x="13" y="4" width="7" height="16" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}
