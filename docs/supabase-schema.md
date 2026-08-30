# Schema Supabase — catálogo

Migration: [`supabase/migrations/20260829180000_pokemon_tcg_catalog.sql`](../supabase/migrations/20260829180000_pokemon_tcg_catalog.sql)

## Tabelas principais

- `series` → `sets` → `cards`
- `card_variants`, `card_identifiers`, `card_translations`
- `card_attacks`, `card_weaknesses`, `card_resistances`, `card_rules`
- `card_images`, `card_prices`, `card_price_history`
- `data_sources`, `sync_jobs`, `sync_errors`, `sync_checkpoints`, `set_coverage`

## View

- `catalog_cards_search` — busca com nomes PT/EN

## RLS

- Catálogo: `SELECT` público (`anon`, `authenticated`)
- Escrita: apenas **service role** (CLI)
- Sync metadata: `SELECT` apenas admins (`is_admin()`)

## Storage

- Bucket `card-images` — leitura pública

## Índices

- `pg_trgm` em `cards.name` e `card_translations.name`
- GIN em `cards.types`, `cards.national_pokedex_numbers`
