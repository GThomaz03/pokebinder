# Ingestão de dados

Módulo: [`src/ingestion/`](../src/ingestion/)

## Componentes

- `sources/tcgdex/apiSource.ts` — adapter REST v2
- `normalizers/tcgdexNormalizer.ts` — normalização + validação
- `repository/catalogWriter.ts` — upserts Supabase
- `jobs/syncManager.ts` — orquestração import/sync
- `jobs/checkpoint.ts` — checkpoints + logs
- `retry.ts` — backoff, timeout, rate limit

## Interface de fonte

```typescript
interface CardDataSource {
  getSeries(): Promise<ExternalSerie[]>
  getSets(): Promise<ExternalSet[]>
  getCards(setId: string): Promise<ExternalCardSummary[]>
  getCard(cardId: string, lang?: string): Promise<ExternalCard | null>
}
```

## Adicionar nova fonte

1. Implementar `CardDataSource` em `src/ingestion/sources/<nome>/`
2. Criar normalizer em `src/ingestion/normalizers/`
3. Registrar em `data_sources`
4. Integrar no `SyncManager` ou job dedicado
5. Documentar licença em `docs/data-sources.md`

## Checkpoints

Tabela `sync_checkpoints`: `(source, entity_type, entity_id, status)`. Import retoma sets não marcados como `completed`.

## Erros

`sync_jobs` + `sync_errors` registram falhas com payload, endpoint e retry_count.
