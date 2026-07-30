import { NavLink, Outlet } from 'react-router-dom'
import { LANG_OPTIONS } from '../i18n'
import { useLanguage } from '../hooks/useLanguage'
import './Layout.css'

export function Layout() {
  const { lang, setLang } = useLanguage()

  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark" aria-hidden />
          <span>PokéBinder</span>
        </NavLink>

        <nav className="nav" aria-label="Principal">
          <NavLink to="/" end>
            Fichários
          </NavLink>
          <NavLink to="/decks">Decks</NavLink>
          <NavLink to="/repository">Repositório</NavLink>
        </nav>

        <label className="lang-select">
          <span className="sr-only">Idioma das cartas</span>
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as typeof lang)}
          >
            {LANG_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.short} — {opt.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="main">
        <Outlet />
      </main>
    </div>
  )
}
