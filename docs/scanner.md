# Scanner de cartas

O scanner em `/repository/scan` substitui o pipeline antigo (MobileCLIP, YOLO e `embeddings.bin`). A identificação segue o desenho do [pokeum](https://github.com/TBLgGamin/pokeum) (MIT): achar o quadrilátero da carta, desfazer a perspectiva, comparar hashes perceptuais e ler o número da coleção. A fusão desses sinais está em `src/lib/scanner/fusion.ts`. A licença copiada está em `src/lib/scanner/pokeum-LICENSE.txt`.

O catálogo consultado é o do PokéBinder (`public.cards` no Supabase). O catálogo do pokeum não é importado.

## Como uma carta é reconhecida

1. A foto é reduzida e as regiões com proporção de carta Pokémon (cerca de 63×88 mm) são recortadas. Várias cartas na mesma foto viram vários recortes. Isso reaproveita a ideia de lote do scanner por fotografia; o código YOLO daquele repositório não entra aqui porque o projeto não tem licença.
2. Cada recorte é endereçado para 630×880 px.
3. Tesseract lê a faixa de baixo (`025/193`, código da coleção quando aparece).
4. Quando o número é lido, o Supabase filtra `cards.number` / `printed_number` e a comparação visual baixa no máximo 24 artes desses candidatos. Um índice local não substitui essa lista.
5. Quando o número não é lido, ou quando ele não existe no catálogo, o scanner consulta o índice visual que estiver carregado: o arquivo publicado `/scan/hash-index.json`, se existir, ou um JSON escolhido na sessão pelo botão “Carregar índice local”. Sem índice, a carta vai para a escolha manual.
6. A fusão do pokeum decide entre reconhecida, revisão ou sem match. O OCR ajusta a pontuação e não apaga um candidato sozinho.

O arquivo `public/scan/hash-index.json` não faz parte do deploy atual. O piloto fica em `data/scan/`, fora do Git e fora da pasta publicada.

Nada é gravado no inventário até a confirmação da fila. A confirmação chama `useInventory.addQty` uma vez por carta, somando cópias do mesmo `cardKey`. Um segundo clique da mesma fila não soma de novo. Usuário sem login continua no `localStorage`. Usuário logado segue o sync já existente de `user_inventory` (RLS inalterada).

A fila vive só na sessão. Fechar a página descarta os recortes. As imagens não são enviadas a um servidor nosso.

## Custo e hospedagem

Não há serviço pago nem processo Python. O reconhecimento roda no navegador. O deploy continua sendo o site na Vercel mais o Supabase que o projeto já usa.

Limites do caminho sem índice visual completo:

- O número da coleção precisa ser legível, ou o usuário escolhe a carta.
- A comparação visual baixa no máximo 24 artes por recorte.
- Cartas muito sobrepostas, fundo da mesma cor ou foto escura podem não gerar recorte.
- Os limiares (`0.80` de confiança e `0.10` de margem) são os do pokeum e estão em `src/lib/scanner/constants.ts`. Eles não são uma taxa de acerto medida neste catálogo.

O encoder DINOv2 do pokeum (~85 MB) e a matriz de embeddings das ~80 mil cartas não vão para o celular. A fusão do pokeum já prevê um sinal ausente: o peso é redistribuído entre os sinais que rodaram (aqui, o hash).

## Índice visual

O índice guarda hashes, não as imagens. Cada carta leva cinco hashes de 256 bits em hexadecimal, mais id, nome, número, coleção, idioma e a URL já existente no catálogo.

No navegador ele só é consultado quando o OCR não entrega um número útil, ou quando esse número não volta nenhuma carta. Com o número lido, a busca continua sendo a lista do catálogo (até 24 artes baixadas na hora).

Não há `public/scan/hash-index.json` no site. Gerar o piloto local:

```bash
npm run scan:hash-pilot
npm run scan:hash-pilot -- --limit=300
```

O comando usa a chave anon (`VITE_SUPABASE_ANON_KEY`). A chave de serviço não entra nele. A saída é `data/scan/pilot-hash-index.json` e o relatório `data/scan/pilot-report.json`. Os dois estão no `.gitignore`. Rodar de novo pula as cartas já gravadas e completa até o limite, então uma interrupção não recomeça do zero.

Para comparar uma foto com o piloto, sem publicar o arquivo:

```bash
npm run scan:hash-query -- --image=caminho/foto.jpg
```

No scanner, o botão “Carregar índice local” lê esse JSON só na memória da aba.

O índice completo não é gerado nesta fase. Estimativa a partir do formato: cerca de 0,7 KB por carta em JSON, perto de 50 MB para 80 mil cartas, baixados inteiros pelo navegador a cada sessão. A Vercel publicaria esse arquivo junto com o site. O procedimento de fotos reais está em `docs/scanner-validation.md`.

`npm run scan:set-index` continua gerando `public/scan/set-index.json`, usado pelo catálogo TCGdex fora do scanner.

## Variáveis

Nenhuma variável nova. O scanner usa as mesmas `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do restante do app. A chave de serviço fica só no script local de índice.

## Desenvolvimento

A câmera exige HTTPS. `npm run dev` sobe o Vite com certificado local na porta 5173.
