import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import { queryClient } from './lib/queryClient'
import './index.css'

/** SDK cache can exhaust localStorage quota and break card loads in production. */
function purgeTcgdexSdkCache() {
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith('@tcgdex-cache/')) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
    // Drop broken RQ persist from v1 that may have cached null card results
    localStorage.removeItem('pokebinder-rq-v1')
  } catch {
    /* private mode / quota */
  }
}

purgeTcgdexSdkCache()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
