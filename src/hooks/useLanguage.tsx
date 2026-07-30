import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CardLang } from '../types'

const LANG_KEY = 'pokebinder-lang'

type LangContextValue = {
  lang: CardLang
  setLang: (lang: CardLang) => void
}

const LangContext = createContext<LangContextValue | null>(null)

function readLang(): CardLang {
  const stored = localStorage.getItem(LANG_KEY)
  if (stored === 'pt' || stored === 'en' || stored === 'ja') return stored
  return 'pt'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<CardLang>(readLang)

  const setLang = useCallback((next: CardLang) => {
    setLangState(next)
    localStorage.setItem(LANG_KEY, next)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang === 'pt' ? 'pt-BR' : lang
  }, [lang])

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang])

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>
}

export function useLanguage() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
