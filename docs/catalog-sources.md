# Fontes do catálogo Pokémon TCG

Atualizado em 14 de outubro de 2026. O catálogo servido pelo app está no Supabase, não é lido da API a cada página.

## Decisão

Manter o **TCGdex** como fonte principal e gravar o resultado no Supabase. Não adotar uma segunda base para importação em massa nesta etapa.

Motivo: o TCGdex é a única fonte pública encontrada que junta português, inglês e japonês, tem API e dump, licença MIT do banco de dados e já é o modelo de ids do PokéBinder (`sm12` ≠ `SM12`). Completar lacunas continua sendo reimportar sets do TCGdex, não misturar outro esquema de ids.

## Comparação

| Critério | TCGdex | Pokémon TCG Data | Scrydex | PTCG-database |
|---|---|---|---|---|
| URL | https://github.com/tcgdex/cards-database e https://api.tcgdex.net/v2 | https://github.com/PokemonTCG/pokemon-tcg-data | https://scrydex.com/docs/pokemon/api-reference | https://github.com/type-null/PTCG-database |
| Idiomas | en, pt-BR, ja e outros, com cobertura desigual | inglês | en e ja; pt não é idioma de primeira classe | ja, en, pt e outros, raspados |
| Acesso | API REST e repositório | dump JSON | API paga, a partir de US$ 29/mês | JSON no GitHub |
| Licença dos dados | MIT do repositório. Arte e texto das cartas continuam da The Pokémon Company | repositório legado; a API pública sai do ar em 1º de março de 2027 | termos comerciais; sem dump redistribuível | código MIT; o conteúdo vem do site oficial japonês e de outras páginas |
| Imagens | CDN `assets.tcgdex.net`, hotlink | URLs do images.pokemontcg.io | da API, sob os termos pagos | URLs de terceiros; não redistribuir arte |
| Atualização | releases ativos em 2026, inclusive cartas ja e pt | congelado como fonte histórica | mantido, com crédito por request | snapshot japonês citado em 16 de setembro de 2026 |
| Uso aqui | fonte primária | só cruzamento de ids em inglês, até 2027 | não usar sem contrato | não importar em massa; ids e licença do texto não batem com o catálogo atual |

Não foi feito scraping. `jumbo` no TCGdex anuncia 160 cartas e devolve a lista vazia; isso é limite da fonte, não um filtro do app.

## Cobertura comprovada no Supabase

Medido em 14 de outubro de 2026, depois do vínculo por `canonical_id` e da importação de `SV10`.

| Medida | Valor |
|---|---|
| Impressões armazenadas | 42.174 |
| Coleções | 378 |
| Vínculo id ↔ coleção divergente | 0 |
| Conteúdo principal en / pt-BR / ja | 15.642 / 13.875 / 12.657 |
| `sm12` / `SM12` | 272 / 99 |
| `sv10` / `SV10` | 343 / 132 |

Isso é cobertura do catálogo contra o TCGdex já importado, não cobertura global de todas as impressões oficiais. Não houve varredura nova de cada set pt/en/ja nesta rodada.

## Lacunas que continuam

- `jumbo`, `rc`, `sp` e `wp`: a API não devolve cartas. O checkpoint fica `failed` quando o set anuncia cartas e a lista vem vazia.
- Relatório de 14 de setembro (`docs/catalog-universe-gap.json`): `exu`, `PCG2-067`, `PCG6-043`, `PCG7-015`, `PCG9-028`. A gravação falhou e a mensagem antiga era `[object Object]`. O import agora serializa o erro em JSON.
- `card_variants` segue vazia. Arte alternativa que o TCGdex modela como outro `canonical_id` já é outra impressão. Variante de foil no mesmo id ainda não está materializada.
- Tradução pt-BR não existe para toda impressão. A carta continua buscável pelo nome que a fonte tem e pelo id. Não inventamos tradução.

## Como atualizar

```bash
npm run cards:import -- --set=SV10
npm run cards:relink-sets
npm run cards:universe-gap
```

`cards:universe-gap` só compara e grava relatório. Não substitui o catálogo. Uma importação ampla precisa ser autorizada antes de rodar em produção.
