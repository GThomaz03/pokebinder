import { useEffect, useState, type ReactNode } from 'react'
import type { Binder, BinderSettings as BinderSettingsType, GridLayout } from '../../types'
import { BinderSettings } from './BinderSettings'
import './BinderSettings.css'

type SettingsAdapters = {
  updateSettings: (patch: Partial<BinderSettingsType>) => void
  setGrid: (grid: GridLayout) => void
  addPages: (count?: number) => void
  renameBinder: (name: string) => void
  progress?: () => { owned: number; total: number; filled: number; slots: number }
}

type Props = {
  open: boolean
  binder: Binder
  onClose: () => void
  adapters: SettingsAdapters
  membersPanel: ReactNode
  initialTab?: 'settings' | 'members'
}

export function CollabSettingsDrawer({
  open,
  binder,
  onClose,
  adapters,
  membersPanel,
  initialTab = 'settings',
}: Props) {
  const [tab, setTab] = useState<'settings' | 'members'>(initialTab)

  useEffect(() => {
    if (open) setTab(initialTab)
  }, [open, initialTab])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <aside
        className="settings-drawer collab-settings-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Configurações do fichário compartilhado"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-head collab-settings-head">
          <div className="collab-settings-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'settings'}
              className={tab === 'settings' ? 'active' : ''}
              onClick={() => setTab('settings')}
            >
              Configurações
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'members'}
              className={tab === 'members' ? 'active' : ''}
              onClick={() => setTab('members')}
            >
              Membros
            </button>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </header>

        {tab === 'settings' ? (
          <BinderSettings open binder={binder} onClose={onClose} adapters={adapters} embedded />
        ) : (
          <div className="collab-members-panel">{membersPanel}</div>
        )}
      </aside>
    </div>
  )
}
