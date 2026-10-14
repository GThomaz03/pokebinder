# Scanner

O scanner ativo está em `src/lib/scanner` e na rota `/repository/scan`.

Ele não usa mais `embeddings.bin`, MobileCLIP nem YOLO. A descrição do pipeline, do índice opcional e do custo está em `docs/scanner.md`.

`set-index.json` não faz parte do reconhecimento. O catálogo TCGdex ainda o consulta para achar coleções pelo total oficial (`src/api/tcgdex.ts`). Gere de novo com `npm run scan:set-index` se esse arquivo for apagado.
