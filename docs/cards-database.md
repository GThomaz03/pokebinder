# Catálogo Pokémon TCG — PokéBinder

O catálogo de cartas vive no **Supabase Postgres**. O frontend lê via `cardRepository` → `supabaseCardProvider`. Fontes externas (TCGdex, etc.) são usadas **somente** pelos scripts de ingestão CLI.

## Arquitetura

```
Frontend → cardRepository → supabaseCardProvider → Supabase (RLS read)
CLI      → SyncManager    → TCGdex API           → Supabase (service role)
```

## IDs públicos

- `cards.canonical_id` preserva o ID TCGdex (`base1-4`, `swsh3-136`)
- Inventário/fichários continuam usando `cardId::pt::reverse`

## Comandos

| Comando | Descrição |
|---------|-----------|
| `npm run cards:import` | Importação inicial / retomada (checkpoints) |
| `npm run cards:import -- --set=base1` | Um set específico |
| `npm run cards:import -- --limit=1` | Limitar sets |
| `npm run cards:sync` | Sync incremental |
| `npm run cards:health` | Diagnóstico |

## Admin

- `/admin/data` — estatísticas e última sync
- `/admin/data/health` — problemas de completude

Requer `auth.users.raw_app_metadata.role = 'admin'`.

## Fallback

Se o catálogo Supabase estiver **vazio**, o app usa TCGdex/pokemontcg.io temporariamente até a primeira importação.
