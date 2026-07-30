export type BinderThemeId = 'arquivo' | 'mesa' | 'ringbound'

export type BinderThemeMeta = {
  id: BinderThemeId
  letter: 'A' | 'B' | 'C'
  name: string
  blurb: string
}

export const BINDER_THEMES: BinderThemeMeta[] = [
  {
    id: 'arquivo',
    letter: 'A',
    name: 'Arquivo',
    blurb: 'Catálogo claro, tipografia editorial',
  },
  {
    id: 'mesa',
    letter: 'B',
    name: 'Mesa',
    blurb: 'Bancada noturna, contraste alto',
  },
  {
    id: 'ringbound',
    letter: 'C',
    name: 'Ringbound',
    blurb: 'Fichário físico, lombada e sleeves',
  },
]

export const DEFAULT_BINDER_THEME: BinderThemeId = 'mesa'

const STORAGE_KEY = 'pokebinder-binder-theme-v1'

export function isBinderThemeId(value: string): value is BinderThemeId {
  return value === 'arquivo' || value === 'mesa' || value === 'ringbound'
}

export function loadBinderTheme(): BinderThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isBinderThemeId(raw)) return raw
  } catch {
    /* ignore */
  }
  return DEFAULT_BINDER_THEME
}

export function saveBinderTheme(id: BinderThemeId) {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* ignore */
  }
}
