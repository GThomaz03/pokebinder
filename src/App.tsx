import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthModal } from './components/AuthModal'
import { Layout } from './components/Layout'
import { AuthProvider } from './hooks/useAuth'
import { BindersProvider } from './hooks/useBinders'
import { CloudSyncProvider } from './hooks/useCloudSync'
import { DecksProvider } from './hooks/useDecks'
import { InventoryProvider } from './hooks/useInventory'
import { LanguageProvider } from './hooks/useLanguage'
import { TrayProvider } from './hooks/useTray'
import { BinderViewPage } from './pages/BinderView'
import { BindersPage } from './pages/Binders'
import { DeckBuilderPage } from './pages/DeckBuilder'
import { DecksPage } from './pages/Decks'
import { RepositoryPage } from './pages/Repository'
import { SharedViewPage } from './pages/SharedView'

export default function App() {
  return (
    <AuthProvider>
      <LanguageProvider>
        <CloudSyncProvider>
          <InventoryProvider>
            <BindersProvider>
              <DecksProvider>
                <TrayProvider>
                  <BrowserRouter>
                    <Routes>
                      <Route path="share/:token" element={<SharedViewPage />} />
                      <Route element={<Layout />}>
                        <Route index element={<BindersPage />} />
                        <Route path="binders/:id" element={<BinderViewPage />} />
                        <Route path="repository" element={<RepositoryPage />} />
                        <Route path="decks" element={<DecksPage />} />
                        <Route path="decks/:id" element={<DeckBuilderPage />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Route>
                    </Routes>
                    <AuthModal />
                  </BrowserRouter>
                </TrayProvider>
              </DecksProvider>
            </BindersProvider>
          </InventoryProvider>
        </CloudSyncProvider>
      </LanguageProvider>
    </AuthProvider>
  )
}
