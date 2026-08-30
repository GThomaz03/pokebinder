# Fontes de dados

| Fonte | URL | Licença | Status | Campos |
|-------|-----|---------|--------|--------|
| **TCGdex** | https://api.tcgdex.net/v2 | MIT ([cards-database](https://github.com/tcgdex/cards-database)) | Ativa (primária) | séries, sets, cartas, variantes, traduções, preços, imagens |
| **Pokémon TCG API** | https://api.pokemontcg.io/v2 | Ver [pokemon-tcg-data](https://github.com/PokemonTCG/pokemon-tcg-data) | Adapter preparado | cartas, sets, IDs cruzados |
| **Liga Pokémon** | https://www.ligapokemon.com.br | Sem API oficial | **Adiada** | — |
| **Manual** | — | — | Suportado | CSV/JSON futuro |

## Limitações conhecidas

- **TCGdex**: dados mantidos pela comunidade; cobertura varia por idioma (ver [status](https://tcgdex.dev)).
- **Liga Pokémon**: scrapers de terceiros violam termos — não implementado.
- **Imagens**: CDN TCGdex até mirror no Storage `card-images`.

## Registro

Cada sync atualiza `data_sources.last_sync_at` e registra licença/metadata na tabela `data_sources`.
