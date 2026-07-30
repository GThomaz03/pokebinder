import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { BindersProvider } from './hooks/useBinders'
import { DecksProvider } from './hooks/useDecks'
import { InventoryProvider } from './hooks/useInventory'
import { LanguageProvider } from './hooks/useLanguage'
import { TrayProvider } from './hooks/useTray'
import { BinderViewPage } from './pages/BinderView'
import { BindersPage } from './pages/Binders'
import { DeckBuilderPage } from './pages/DeckBuilder'
import { DecksPage } from './pages/Decks'
import { RepositoryPage } from './pages/Repository'

export default function App() {
  return (
    <LanguageProvider>
      <InventoryProvider>
        <BindersProvider>
          <DecksProvider>
            <TrayProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<Layout />}>
                    <Route index element={<BindersPage />} />
                    <Route path="binders/:id" element={<BinderViewPage />} />
                    <Route path="repository" element={<RepositoryPage />} />
                    <Route path="decks" element={<DecksPage />} />
                    <Route path="decks/:id" element={<DeckBuilderPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </TrayProvider>
          </DecksProvider>
        </BindersProvider>
      </InventoryProvider>
    </LanguageProvider>
  )
}
