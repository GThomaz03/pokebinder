# Validação do scanner

Este procedimento mede o piloto visual e deixa pronto o teste com fotografias reais. Ele não publica índice e não altera o inventário.

## O que cada caminho faz

| Situação | O que o scanner faz |
|---|---|
| OCR lê o número e o catálogo tem cartas | Filtra `public.cards` e compara no máximo 24 artes baixadas na hora. O índice não substitui essa lista. |
| OCR lê um número que não existe no catálogo | Consulta o índice carregado, se houver. |
| OCR não lê número | Consulta o índice carregado. Sem índice, a carta fica para escolha manual. |
| Índice publicado em `/scan/hash-index.json` | Não existe no deploy atual. |
| JSON escolhido em “Carregar índice local” | Vale só na aba, e só nos dois casos de fallback acima. |

Um número lido errado segue o catálogo e não cai no índice. Por isso a validação visual da foto é feita também pelo comando abaixo, que compara a imagem direto com o piloto.

## Piloto

```bash
npm run scan:hash-pilot
npm run scan:hash-pilot -- --limit=300
```

Precisa de `VITE_SUPABASE_URL` (ou `SUPABASE_URL`) e `VITE_SUPABASE_ANON_KEY` no `.env`. A chave de serviço não é lida.

Saída, fora do Git:

- `data/scan/pilot-hash-index.json`
- `data/scan/pilot-report.json`

O relatório traz cartas pedidas, já indexadas, baixadas, falhas, tempo, tamanho do arquivo, idiomas e coleções. Uma nova execução pula ids já presentes. Para crescer o piloto, aumente `--limit` (teto 500 neste comando).

As imagens vêm das URLs já gravadas no catálogo (em geral o CDN do TCGdex, às vezes PokémonTCG.io ou Scrydex). O índice guarda o hash e a URL, não o arquivo da arte. A arte continua © The Pokémon Company. Não commite o JSON e não o coloque em `public/`.

## Fotografias reais

1. Crie `data/scan/fixtures/photos/` e coloque fotos suas, não o arquivo de arte do catálogo. Varie enquadramento, luz e perspectiva.
2. Copie `scripts/fixtures/scan-manifest.example.json` para `data/scan/fixtures/manifest.json`.
3. Em cada caso, `file` é o caminho relativo a `data/scan/fixtures/` e `expectedId` é o `canonical_id` da carta. Anote no `notes` se a foto é inclinada, escura, de outro idioma ou de uma variante.
4. Rode:

```bash
npm run scan:validate
```

O relatório `data/scan/validation-report.json` lista, para cada foto, se o id esperado apareceu e em que posição entre os cinco primeiros. Também registra arquivo ausente. Sem fotos, o comando só explica o procedimento e não calcula acerto.

Separe, na sua leitura do relatório:

- OCR: no scanner, a linha “Leitura” mostra o texto. Compare com o número impresso.
- Candidatos por número: só aparecem quando essa leitura tem um `NNN/MMM`.
- Recuperação visual: `scan:hash-query` e `scan:validate`, contra o piloto.
- Falso positivo: o primeiro id não é o `expectedId`.
- Não encontrada: `rank` nulo.
- Idioma e variante: use fotos de cartas pt, en e ja que estejam dentro do piloto. O piloto não cobre o catálogo inteiro.

Consulta avulsa:

```bash
npm run scan:hash-query -- --image=data/scan/fixtures/photos/sua-foto.jpg
```

## O que ainda não está medido

Enquanto `manifest.json` não tiver fotos reais, não há taxa de acerto. O índice completo das cerca de 80 mil cartas não foi gerado.
