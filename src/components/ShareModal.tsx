import { useEffect, useState } from 'react'
import {
  createShareLink,
  shareUrl,
  type ShareResourceType,
} from '../lib/cloudStorage'
import { useAuth } from '../hooks/useAuth'
import './ShareModal.css'

type ShareModalProps = {
  open: boolean
  onClose: () => void
  resourceType: ShareResourceType
  resourceId: string
  title: string
  snapshot: unknown
}

export function ShareModal({
  open,
  onClose,
  resourceType,
  resourceId,
  title,
  snapshot,
}: ShareModalProps) {
  const { user, requireAuth } = useAuth()
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      setLink(null)
      setError(null)
      setBusy(false)
      setCopied(false)
    }
  }, [open])

  if (!open) return null

  async function generate() {
    if (!requireAuth() || !user) return
    setBusy(true)
    setError(null)
    try {
      const share = await createShareLink(
        user.id,
        resourceType,
        resourceId,
        title,
        snapshot as never,
      )
      setLink(shareUrl(share.token))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao criar link.')
    } finally {
      setBusy(false)
    }
  }

  async function copy() {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="share-backdrop" role="presentation" onClick={onClose}>
      <div
        className="share-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="share-close" onClick={onClose} aria-label="Fechar">
          ×
        </button>

        <h2 id="share-title">Compartilhar {resourceType === 'binder' ? 'fichário' : 'deck'}</h2>
        <p className="share-sub">
          Gere um link público de leitura para <strong>{title}</strong>. Qualquer pessoa com o link
          poderá visualizar, mas não editar.
        </p>

        {!link ? (
          <button type="button" className="btn primary" onClick={generate} disabled={busy}>
            {busy ? 'Gerando…' : 'Gerar link de compartilhamento'}
          </button>
        ) : (
          <div className="share-result">
            <input type="text" readOnly value={link} aria-label="Link de compartilhamento" />
            <button type="button" className="btn accent" onClick={copy}>
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
        )}

        {error && <p className="share-error">{error}</p>}
      </div>
    </div>
  )
}
