type Props = {
  label?: string
  onLabelChange?: (label: string) => void
  onClear?: () => void
  placeholder?: boolean
}

/** Fixed-height header of a PagePanel: clear button + page name field. */
export function PageToolbar({ label, onLabelChange, onClear, placeholder }: Props) {
  if (placeholder) {
    return (
      <div className="page-toolbar">
        <span className="page-label placeholder-label">Sem página direita</span>
      </div>
    )
  }

  return (
    <div className="page-toolbar">
      <button
        type="button"
        className="icon-btn"
        title="Limpar página"
        onClick={onClear}
        aria-label="Limpar página"
      >
        <TrashIcon />
      </button>
      <input
        className="page-label"
        value={label ?? ''}
        placeholder="Clique para nomear a página"
        onChange={(e) => onLabelChange?.(e.target.value)}
      />
    </div>
  )
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}
