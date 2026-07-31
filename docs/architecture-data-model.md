# Modelo de dados — evolução futura

## Estado atual

A persistência do usuário no Supabase usa **um blob JSON por recurso**:

| Tabela | Conteúdo |
|--------|----------|
| `user_binders` | Array completo de fichários |
| `user_inventory` | Mapa `cardKey → qty` |
| `user_decks` | Array completo de decks |

Vantagens hoje: implementação simples, sync local-first com debounce, poucas tabelas/RLS.

Limitações: upserts substituem o documento inteiro; estatísticas/consultas granulares são difíceis; conflitos multi-dispositivo resolvem por “último write ganha”.

## Quando migrar para tabelas relacionais

Considere migrar quando **um ou mais** destes critérios forem verdadeiros:

1. Inventários com milhares de entradas e sync lento / payloads grandes.
2. Necessidade de queries (ex.: “quem tem esta carta”, ranking, analytics).
3. Sync incremental / merge por item entre dispositivos.
4. Colaboração em inventário (hoje collab é só em `shared_binders`).

## Direção sugerida (não implementada)

```
profiles
user_binders_meta (id, name, settings, …)
binder_pages / binder_slots
inventory_items (user_id, card_key, qty, …)
decks_meta / deck_cards
```

Migração: dual-write temporário ou job one-shot que explode o JSON em linhas; manter APIs de repositório no frontend estáveis (`saveUserInventory` etc.) para isolar a UI.

## Sync atual (melhorias já feitas)

- Debounce 1,5s nos hooks de dados.
- **Fila serializada** por tabela em `cloudStorage.ts` (evita upserts concorrentes; coalesce dirty).

Sync incremental por diff permanece **fora de escopo** até a migração relacional.
