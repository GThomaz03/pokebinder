#!/usr/bin/env node
import { fetchJson } from '../src/ingestion/retry'

const ids = ['exu-%3F', 'exu-?', 'PCG2-067', 'PCG6-043', 'PCG7-015', 'PCG9-028', 'S12a-189', 'SV4M-079']

async function main() {
  for (const id of ids) {
    for (const lang of ['en', 'ja'] as const) {
      try {
        const raw = await fetchJson<Record<string, unknown>>(
          `https://api.tcgdex.net/v2/${lang}/cards/${id}`,
          { maxRetries: 1, timeoutMs: 15000 },
        )
        console.log('OK', lang, id, raw?.name ?? raw?.id)
      } catch (err) {
        const status = (err as { status?: number }).status
        console.log('FAIL', lang, id, status ?? err)
      }
    }
  }
}

main()
