# Sincronização

## Importação inicial

```bash
# Teste: 1 set
npm run cards:import -- --set=base1

# Retomar import completo (pula sets completed)
npm run cards:import

# Forçar reprocessamento
npm run cards:import -- --full
```

## Incremental

```bash
npm run cards:sync
```

Compara com checkpoints; insere/atualiza; **nunca deleta** cartas ausentes na fonte.

## Variáveis

Ver [`.env.example`](../.env.example): `SUPABASE_SERVICE_ROLE_KEY`, `TCGDEX_API_URL`, `SYNC_*`.

## Backup

Exportar via Supabase Dashboard → Database → Backups, ou `pg_dump` do projeto.

## Resolução de erros

1. `npm run cards:health`
2. Consultar `sync_errors` (admin ou SQL)
3. Corrigir fonte ou reexecutar import do set afetado: `--set=<id>`
