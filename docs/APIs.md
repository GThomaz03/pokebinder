# Documentação de APIs — PokéBinder

Este documento descreve **todas as APIs e serviços externos** usados pelo PokéBinder: onde são configurados, como são chamados, quem consome cada chamada e qual o propósito.

> **Arquitetura geral:** o app é um SPA (Vite + React). **Não há backend próprio** nem rotas `app/api`. Toda persistência remota passa pelo **Supabase**; catálogo e preços de cartas vêm do **TCGdex** (via camada `cardRepository` / `priceRepository`); câmbio de **open.er-api.com**; scanner usa modelos ML baixados no browser (Hugging Face / ONNX / Tesseract).
>
> **Camada interna (2026-07):** catálogo e preços estão separados (`src/api/cards/`, `src/api/prices/`), com modelo `NormalizedCard` / `PriceQuote`, TanStack Query, FX sob demanda e HTTP com retry/timeout. Ver também [`architecture-data-model.md`](./architecture-data-model.md).

---

## Índice

1. [Visão geral](#1-visão-geral)
2. [Supabase](#2-supabase)
3. [TCGdex API](#3-tcgdex-api)
4. [CDNs de imagens](#4-cdns-de-imagens)
5. [Open Exchange Rates (FX)](#5-open-exchange-rates-fx)
6. [Hugging Face / Transformers.js (MobileCLIP)](#6-hugging-face--transformersjs-mobileclip)
7. [Tesseract.js (OCR)](#7-tesseractjs-ocr)
8. [Assets estáticos `/scan/*`](#8-assets-estáticos-scan)
9. [Camadas internas (não são HTTP externo)](#9-camadas-internas-não-são-http-externo)
10. [Grafo de chamadas](#10-grafo-de-chamadas)
11. [Variáveis de ambiente](#11-variáveis-de-ambiente)

---

## 1. Visão geral

| Serviço | Tipo | Auth | Módulo principal |
|---------|------|------|------------------|
| **Supabase** | Auth + Postgres + Storage + Realtime + RPC | Anon key + JWT de sessão | `src/lib/supabase.ts` |
| **TCGdex** | REST (SDK + `fetchJson`) | Público | `src/api/cards/tcgdexCardProvider.ts` + `src/api/tcgdex.ts` |
| **assets.tcgdex.net** | CDN de imagens | Público | `src/api/images/imageProvider.ts` |
| **images.pokemontcg.io** | CDN de imagens (fallback) | Público | `imageProvider.ts` |
| **open.er-api.com** | Câmbio EUR/USD → BRL | Público | `src/api/fx/fxProvider.ts` |
| **Pokémon TCG API** | Preços TCGPlayer/Cardmarket (fallback + sync) | Opcional `POKEMON_TCG_API_KEY` | `src/api/prices/pokemonTcgPriceProvider.ts` |
| **Hugging Face** | Download do modelo MobileCLIP | Público | `src/lib/scan/clip.worker.ts` |
| **jsDelivr (Tesseract)** | Worker/WASM/lang OCR | Público | `src/lib/scan/ocr.ts` |
| **`/scan/*`** | Arquivos estáticos do app | N/A | `public/scan/` |

Dependências relevantes (`package.json`):

| Pacote | Papel |
|--------|--------|
| `@supabase/supabase-js` | Cliente Supabase |
| `@tcgdex/sdk` | Cliente REST TCGdex |
| `@tanstack/react-query` | Cache/dedupe de catálogo e preços |
| `@xenova/transformers` | Inferência MobileCLIP no browser |
| `onnxruntime-web` | YOLO local |
| `tesseract.js` | OCR |

### Estrutura de providers

```
src/api/
  config.ts
  cards/     → types, http, cardRepository, tcgdexCardProvider
  prices/    → types (PriceQuote, PriceProvider), priceRepository, tcgdexPriceProvider
  fx/        → fxProvider (sob demanda)
  images/    → imageProvider
```

Preços convertidos para BRL são sempre **estimados** (`PriceQuote.estimated = true`).

### Resolução de preços (runtime)

1. **Supabase** — `cards.raw_data.pricing` ou linhas em `card_prices` (populadas por `npm run cards:sync-prices`)
2. **TCGdex** — bloco `pricing` embutido no catálogo (quando disponível)
3. **Pokémon TCG API** — fetch live via `/api/pokemontcg` (proxy) ou direto em scripts CLI

Sync de preços: `npm run cards:sync-prices` (opcional `--set=me2`, `--force`). Recomenda-se `POKEMON_TCG_API_KEY` no `.env` para rate limits maiores.

---

## 2. Supabase

Backend remoto principal. Cobre autenticação, sincronização de dados do usuário, rede social, compartilhamento e fichários colaborativos.

### 2.1 Configuração

**Arquivo:** `src/lib/supabase.ts`

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    })
  : null
```

- Se as env vars não existirem, `supabase` fica `null` e a app funciona só com dados locais.
- Schema SQL: pasta `supabase/migrations/`.
- Região mencionada no `.env.example`: `sa-east-1` (projeto “pokebinder”).

### 2.2 Autenticação (headers)

1. O cliente é criado com a **anon key** pública.
2. Após login, o SDK injeta automaticamente:
   - `Authorization: Bearer <access_token>`
   - `apikey: <anon_key>`
3. Não há headers manuais no código da app.
4. Políticas **RLS** no Postgres restringem o que cada usuário pode ler/escrever.
5. Magic link usa `emailRedirectTo: window.location.origin`.

### 2.3 Auth — métodos e call sites

**Módulo:** `src/hooks/useAuth.tsx`  
**UI:** `src/components/AuthModal.tsx`

| Método SDK | Quando | Propósito |
|------------|--------|-----------|
| `auth.getSession()` | Mount do `AuthProvider` | Restaura sessão do `localStorage` |
| `auth.onAuthStateChange()` | Mount | Atualiza `user`/`session` em login/logout/refresh |
| `auth.signInWithPassword({ email, password })` | Login | Email + senha |
| `auth.signUp({ email, password })` | Cadastro | Cria conta |
| `auth.signInWithOtp({ email, options })` | Magic link | Link por e-mail |
| `auth.signOut()` | Logout | Encerra sessão |

Fluxo típico:

```
AuthModal → useAuth.signInWithPassword / signUp / signInWithMagicLink
         → Supabase Auth API
         → onAuthStateChange fecha o modal e atualiza o contexto
```

`requireAuth()` abre o modal se não houver usuário (usado antes de sync/share/social).

---

### 2.4 Persistência na nuvem (binders, inventário, decks)

**Módulo:** `src/lib/cloudStorage.ts`  
**Consumidores:** `useCloudSync.tsx`, `useBinders.tsx`, `useInventory.tsx`, `useDecks.tsx`, `ShareModal.tsx`, `SharedView.tsx`

#### Tabelas

| Tabela | Operações | Conteúdo |
|--------|-----------|----------|
| `user_binders` | `select` / `upsert` | JSON array de fichários |
| `user_inventory` | `select` / `upsert` | Mapa de inventário |
| `user_decks` | `select` / `upsert` | JSON array de decks |
| `share_links` | `insert` / `select` (dono) / `update` / `delete` + RPC `get_share_link` | Links públicos `/share/:token` |

#### Funções exportadas

| Função | Chamada Supabase | Uso |
|--------|------------------|-----|
| `fetchUserCloudData(userId)` | `Promise.all` de 3× `.from(...).select(...).eq('user_id', ...).maybeSingle()` | Pull no login / sync |
| `saveUserBinders` | `.from('user_binders').upsert(..., { onConflict: 'user_id' })` | Push de binders |
| `saveUserInventory` | idem em `user_inventory` | Push de inventário |
| `saveUserDecks` | idem em `user_decks` | Push de decks |
| `uploadLocalData` | chama as três `save*` em paralelo | Upload completo local → nuvem |
| `createShareLink` | `.from('share_links').insert(...).select(...).single()` | Cria snapshot + token |
| `fetchShareLink(token)` | `.eq('token', token).maybeSingle()` | Página pública `SharedView` |
| `listUserShareLinks` | `.eq('owner_id', userId)` | Lista links do usuário |
| `deleteShareLink` | `.delete().eq('id').eq('owner_id')` | Remove link |
| `shareUrl(token)` | (helper local) | Monta `origin/share/{token}` |

Exemplo de leitura:

```ts
const [bindersRes, inventoryRes, decksRes] = await Promise.all([
  client.from('user_binders').select('binders').eq('user_id', userId).maybeSingle(),
  client.from('user_inventory').select('inventory').eq('user_id', userId).maybeSingle(),
  client.from('user_decks').select('decks').eq('user_id', userId).maybeSingle(),
])
```

O `useCloudSync` orquestra quando puxar/empurrar após autenticação e mudanças locais.

---

### 2.5 Social (perfis, follows, publicação, avatares)

**Módulo:** `src/lib/social.ts`  
**Consumidores:** `Profile.tsx`, `Friends.tsx`, `Layout.tsx`, `Binders.tsx`, `Decks.tsx`, `ShareModal.tsx`, `CollabBinderView.tsx`, `SharedView.tsx`

#### Tabelas / Storage

| Recurso | Ops | Propósito |
|---------|-----|-----------|
| `profiles` | select / update / search (`ilike`, `or`) | Perfil público, username, friend code |
| `follows` | upsert / delete / select | Seguir / deixar de seguir |
| `published_resources` | upsert / delete / select | Binder/deck publicado no perfil |
| Storage bucket `avatars` | upload / list / remove / getPublicUrl | Foto de perfil (≤ 2 MB) |

#### Funções principais

| Função | Como chama | Onde aparece na UI |
|--------|------------|--------------------|
| `getMyProfile` / `getProfileById` | `.from('profiles').select(...).eq('id')` | Perfil próprio / collab members |
| `getProfileByUsername` | `.ilike('username', ...)` | Rota `/u/:username` |
| `getProfileByFriendCode` | `.eq('friend_code', NORMALIZED)` | Busca de amigos |
| `updateMyProfile` | `.update(payload).eq('id')` | Edição de perfil |
| `uploadAvatar` | `storage.from('avatars').upload(path, file, { upsert: true })` + `getPublicUrl` | Upload de foto |
| `clearAvatar` | `list` + `remove` | Remover foto |
| `searchProfiles` | `.eq('is_public', true).or(username/display_name ilike)` | Friends / busca |
| `followUser` / `unfollowUser` | upsert / delete em `follows` | Botão seguir |
| `isFollowing` / `listFollowing` / `listFollowers` | selects em `follows` + join lógico em `profiles` | Lista de amigos |
| `publishResourceToProfile` | reutiliza/cria `share_links` + upsert `published_resources` | Publicar binder/deck |
| `unpublishResource` | delete em `published_resources` (+ opcional limpeza de share) | Remover do perfil |
| `listPublishedByUser` | select em `published_resources` | Grid do perfil público |

Avatar — path no Storage:

```
avatars/{userId}/avatar.{jpg|png|webp|gif}
```

A URL pública recebe `?t={timestamp}` para bust de cache após replace.

---

### 2.6 Fichários colaborativos

**Módulo:** `src/lib/collabBinders.ts`  
**Hook:** `src/hooks/useCollabBinder.ts`  
**Páginas:** `Binders.tsx`, `CollabBinderView.tsx`, `CollabJoinPage.tsx`

#### Tabelas / RPC / Realtime

| Recurso | Ops | Propósito |
|---------|-----|-----------|
| `shared_binders` | insert / select / update / delete | Documento compartilhado + `revision` |
| `binder_members` | insert / select / delete | Membros (owner/editor) |
| RPC `join_shared_binder` | `{ p_token }` | Entrar via convite |
| RPC `invite_friend_to_binder` | `{ p_binder_id, p_friend_id }` | Convidar amigo |
| Realtime channel `shared_binder:{id}` | `postgres_changes` em `shared_binders` | Sync ao vivo |

#### Concorrência otimista

`patchSharedBinder` faz:

```ts
.update({ doc, revision: expectedRevision + 1, ... })
.eq('id', id)
.eq('revision', expectedRevision)
```

Se ninguém atualizou antes, retorna a linha. Se outro membro salvou, `data` é `null` → lança `RevisionConflictError`.

#### Realtime

```ts
client
  .channel(`shared_binder:${id}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'shared_binders',
    filter: `id=eq.${id}`,
  }, (payload) => onChange(mapRow(payload.new)))
  .subscribe()
```

O cleanup chama `removeChannel`.

#### Funções e fluxos de UI

| Função | Fluxo |
|--------|-------|
| `createSharedBinder` | Cria row + insere owner em `binder_members` |
| `listMySharedBinders` | Memberships → `shared_binders.in(ids)` |
| `fetchSharedBinder` | Abre `CollabBinderView` |
| `patchSharedBinder` | Autosave / edições no hook |
| `enableInviteLink` / `disableInviteLink` | Gera token hex 32 chars / limpa |
| `joinByInviteToken` | `CollabJoinPage` → RPC → redireciona para o binder |
| `inviteFriend` | Drawer de collab → RPC |
| `listMembers` / `removeMember` / `leaveBinder` | Gestão de membros |
| `subscribeSharedBinder` | Atualização live enquanto a view está aberta |

URL de convite: `{origin}/collab/join/{token}`.

---

## 3. TCGdex API

Fonte oficial de **catálogo de cartas**, **sets**, **variantes** e **preços embutidos** (Cardmarket EUR / TCGPlayer USD).

### 3.1 Configuração

**Arquivo:** `src/api/tcgdex.ts`  
**Pacote:** `@tcgdex/sdk` (^2.9.0)

```ts
const clients = new Map<CardLang, TCGdex>()

export function getClient(lang: CardLang): TCGdex {
  let client = clients.get(lang)
  if (!client) {
    client = new TCGdex(lang) // 'en' | 'pt' | 'ja'
    clients.set(lang, client)
  }
  return client
}
```

- Base URL efetiva: `/api/tcgdex/{lang}/...` (proxy Vite em dev + rewrite Vercel em prod → `https://api.tcgdex.net/v2`)
- **Pokémon TCG Live** usa o mesmo pool físico — não há endpoint separado; o Browse filtra a série `tcgp` (TCG Pocket)
- Header do SDK: `user-agent: @tcgdex/javascript-sdk/2.9.0` (SDK reservado; catálogo preferencialmente via REST)
- Sem API key / env var
- Cache: React Query + caches in-memory; SDK com `setCacheTTL(0)` para não encher `localStorage`

### 3.2 Métodos SDK → endpoints HTTP

| Chamada no código | Endpoint típico | Função exportada / interna |
|-------------------|-----------------|----------------------------|
| `card.get(id)` / REST | `GET /v2/{lang}/cards/{id}` | `getCard`, hydrate, variantes |
| `card.list(Query...)` / REST | `GET /v2/{lang}/cards?...` | `searchCards`, `searchCardsAdvanced`, variantes |
| `set.list()` / REST | `GET /v2/{lang}/sets` | `fetchSetsMeta`, Browse (1 request) |
| `set.get(setId)` / REST | `GET /v2/{lang}/sets/{id}` | `listSetCards`, detalhe do set |

Filtros REST: `name=like:…`, `category=eq:…`, `pagination:page`, `pagination:itemsPerPage` ([doc](https://tcgdex.dev/rest/filtering-sorting-pagination)).

**Fallback:** se o health probe falhar, `cardRepository` usa **Pokémon TCG API** (`api.pokemontcg.io/v2`) — ver `pokemonTcgProvider.ts`.

### 3.3 REST direto (`fetch`) — scanner

**Arquivo:** `src/lib/scan/cardLookup.ts`

Além do SDK, o scanner resolve OCR → carta com HTTP puro:

```ts
const res = await fetch(`https://api.tcgdex.net/v2/${L}/cards/${setId}-${lid}`)
```

Também lista sets via REST / SDK para montar índice de abreviações. Scripts de build (`scripts/build-card-embeddings.mjs`, `build-set-index.mjs`) consultam a mesma API.

### 3.4 Funções exportadas e consumidores

| Função | Consumidores | Propósito |
|--------|--------------|-----------|
| `searchCards(lang, name, page)` | `AddCardsModal`, `ManualCardSearchModal`, `cardLookup` | Busca simples por nome / localId |
| `searchCardsAdvanced(...)` | `DeckBuilder` | Busca com filtros (categoria, tipo, set…) |
| `fetchDeckCardMeta` | `DeckBuilder` | Meta para regras de deck |
| `getCard` | `prices.hydrateCard`, detalhes, Pokedex | Detalhe completo + pricing |
| `fetchSpeciesVariants` | `CardDetailsModal`, `PokedexPanel` | Variantes (holo, reverse, etc.) |
| `fetchSets` / `getSetMeta` / `getSetsMeta` | Repositório / UI de sets | Logos, símbolos, nomes |
| `extractPrice` | `prices.ts` | Lê `pricing.cardmarket` / `pricing.tcgplayer` do payload |
| `cardImageUrl` / `cardImageCandidates` | `CardImage`, hydrate | Monta URLs WebP high/low |
| `inferMissingImageCandidates` | `CardImage` | Fallback PokémonTCG.io |
| `baseCardId` / `parseOwnedKey` | inventário / binders | Chaves com idioma/variante |

### 3.5 Preços e variantes

Não há API separada de marketplace. Os preços vêm **no JSON da carta TCGdex**:

- Cardmarket → EUR (`pricing.cardmarket`, incl. `avg-holo` para foil)
- TCGPlayer → USD (`pricing.tcgplayer`: `normal`, `holofoil`, `reverse`, `reverse-holofoil`, …)
- **`variants_detailed`**: variantes com `type`, `stamp`, `foil`; pricing por variante quando disponível (v2.45+), senão fallback em `card.pricing`

`extractPrice` / `pricingExtract.ts` normalizam isso; `priceRepository` + FX convertem para BRL.

### 3.6 Idiomas e fallback

Fluxo comum em `getCard` / hydrate:

1. Tenta o idioma ativo (`pt`, `ja`, `en`).
2. Se falhar ou faltar `image`, faz fallback para `en`.
3. Em buscas, pode localizar briefs EN → idioma ativo com `card.get` por id.

---

## 4. CDNs de imagens

Não são APIs JSON; são `GET` de arquivos de imagem usados por `<img>` / cache.

### 4.1 assets.tcgdex.net

**Padrão de URL:**

```
https://assets.tcgdex.net/{lang}/{series}/{setId}/{localId}/{high|low}.webp
```

- Construídas por `cardImageUrl` / `inferTcgdexImageBase` / `cardImageCandidates`.
- Logos/símbolos de sets vêm de `set.logo` / `set.symbol` (`src/api/sets.ts`).
- Fallback de locale: se `pt`/`ja` falhar, tenta `/en/`.
- Script de embeddings baixa imagens via Transformers `RawImage.read(imageUrl)`.

**Consumidor UI:** `src/components/CardImage.tsx` (+ `src/api/imageCache.ts` guarda a URL que funcionou).

### 4.2 images.pokemontcg.io

**CDN de imagens (fallback)** e **Pokémon TCG API** (`api.pokemontcg.io/v2`) quando o TCGdex está indisponível — ver `pokemonTcgProvider.ts` e banners na busca.

**Padrões:**

```
https://images.pokemontcg.io/{setId}/{n}.png
https://images.pokemontcg.io/{setId}/{n}_hires.png
https://images.pokemontcg.io/sve/{n}.png   # energias básicas Scarlet & Violet
```

Usado quando o TCGdex omite `image` (ex.: energias sem arte, ids com `.` remapeados via `toPokemonTcgIoSetId`).

Mapa de energias básicas: `BASIC_ENERGY_SVE_INDEX` em `tcgdex.ts` (grass→1, fire→2, …).

---

## 5. Open Exchange Rates (FX)

Converte preços de mercado para **BRL**.

### 5.1 Configuração e chamada

**Arquivo:** `src/api/fx.ts`

```ts
const [eurRes, usdRes] = await Promise.all([
  fetch('https://open.er-api.com/v6/latest/EUR'),
  fetch('https://open.er-api.com/v6/latest/USD'),
])
// lê rates.BRL de cada resposta
```

| Item | Valor |
|------|--------|
| Endpoints | `GET .../v6/latest/EUR`, `GET .../v6/latest/USD` |
| Cache | `localStorage` key `pokebinder-fx-v1` |
| TTL | 6 horas |
| Auth | Nenhuma |
| Fallback offline | EUR→BRL ≈ 5.8, USD→BRL ≈ 5.1 |

### 5.2 Consumo

- `getFxRates()` / `toBrl()` em `fx.ts`
- `formatPrice`, `formatPriceBrl`, `priceToBrl` em `src/api/prices.ts`
- Warm automático no load do módulo `prices.ts` (`void getFxRates()` no browser)

Preferência de mercado:

- `cardmarket` → tenta EUR, senão USD
- `tcgplayer` → tenta USD, senão EUR

---

## 6. Hugging Face / Transformers.js (MobileCLIP)

Usado no **scanner de cartas** para embedding visual + reconhecimento por similaridade.

### 6.1 Configuração

| Item | Valor |
|------|--------|
| Modelo | `Xenova/mobileclip_s2` |
| Dimensão | 512 (`SCAN_VISION_DIM`) |
| Config | `src/lib/scan/modelConfig.ts` |
| Worker | `src/lib/scan/clip.worker.ts` |
| Runtime | `@xenova/transformers` (`AutoProcessor` + `CLIPVisionModelWithProjection`) |

```ts
processor = await AutoProcessor.from_pretrained(SCAN_VISION_MODEL)
vision = await CLIPVisionModelWithProjection.from_pretrained(SCAN_VISION_MODEL, {
  quantized: true,
})
```

### 6.2 Rede

Na primeira execução (ou quando o cache do browser está vazio), o Transformers.js baixa pesos/ONNX de:

```
https://huggingface.co/Xenova/mobileclip_s2/resolve/main/...
```

Prefetch opcional: `npm run scan:models` → `scripts/fetch-scan-models.mjs`  
Build do índice: `npm run scan:embeddings` → `scripts/build-card-embeddings.mjs`

### 6.3 Fluxo no app

```
CardScanner
  → recognizer.ts (carrega /scan/embeddings.bin + .json)
  → clip.worker.ts (embedding da foto)
  → kNN contra o índice local
  → candidatos → cardLookup / TCGdex para hidratar meta
```

Sem API key do Hugging Face no repositório.

---

## 7. Tesseract.js (OCR)

Extrai texto (número da carta, set, nome) da câmera como sinal complementar ao CLIP.

### 7.1 Configuração

**Arquivo:** `src/lib/scan/ocr.ts`

```ts
const Tesseract = await import('tesseract.js')
const worker = await Tesseract.createWorker('eng')
await worker.setParameters({
  tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789/.- ',
})
```

### 7.2 Downloads de rede (implícitos do pacote)

| Recurso | Origem típica |
|---------|----------------|
| Worker JS | `cdn.jsdelivr.net/npm/tesseract.js@.../dist/worker.min.js` |
| Core WASM | `cdn.jsdelivr.net/npm/tesseract.js-core@...` |
| Lang data `eng` | `cdn.jsdelivr.net/npm/@tesseract.js-data/eng/...` |

### 7.3 Fallback nativo

Se disponível (Chrome Android / alguns desktops), usa `window.TextDetector` antes/em paralelo ao Tesseract.

`warmOcr()` pré-aquece detector + worker com um canvas em branco enquanto a câmera inicia.

Resultado OCR → `cardLookup.resolveCandidates` → REST TCGdex.

---

## 8. Assets estáticos `/scan/*`

Servidos pelo Vite/Vercel a partir de `public/scan/`. **Não são API de servidor**, mas fazem parte do pipeline de dados do scanner.

| Path | Consumidor | Propósito |
|------|------------|-----------|
| `GET /scan/set-index.json` | `cardLookup.ts`, `tcgdex.ts` | Abreviações de set / buckets por official count |
| `GET /scan/embeddings.json` + `.bin` | `recognizer.ts` | Índice visual MobileCLIP |
| `HEAD/GET /scan/models/yolo11n-card.onnx` | `detector.ts` (`onnxruntime-web`) | Detecção de carta na frame (opcional) |
| `/scan/models/mobileclip-*` | prefetch local | Cópia opcional do modelo |

Geração:

```bash
npm run scan:set-index    # scripts/build-set-index.mjs
npm run scan:embeddings   # scripts/build-card-embeddings.mjs
npm run scan:models       # scripts/fetch-scan-models.mjs
```

---

## 9. Camadas internas (não são HTTP externo)

Wrappers e caches que **orquestram** as APIs acima:

| Módulo | Papel |
|--------|--------|
| `src/api/prices.ts` | Cache local de cartas/preços; chama `getCard` + FX; `hydrateCard` |
| `src/api/sets.ts` | Wrapper de `set.get` + cache de logo/símbolo |
| `src/api/imageCache.ts` | `localStorage` das URLs de imagem que carregaram com sucesso |
| `src/hooks/useBoosterPrices.ts` | Preços de produtos sealed — **somente locais**, sem API |
| `src/lib/dealCalculator.ts` | Cálculos offline sobre preços já hidratados |
| `src/data/sealed/*` | Catálogo sealed estático no repo |

> Preços de cartas: TCGdex. Preços sealed/boosters: dados locais do app. Sem Stripe / marketplace checkout.

---

## 10. Grafo de chamadas

```
UI / Hooks
 ├─ AuthModal / useAuth ──────────► Supabase Auth
 ├─ useCloudSync / save* ─────────► user_binders | user_inventory | user_decks
 ├─ ShareModal / SharedView ──────► share_links
 ├─ Profile / Friends / social ───► profiles, follows, published_resources, Storage avatars
 ├─ Collab* / useCollabBinder ────► shared_binders, binder_members, RPC, Realtime
 ├─ AddCards / DeckBuilder / etc. ► TCGdex SDK (search / get / sets)
 ├─ CardDetails / Pokedex / hydrate ► TCGdex + prices.ts + open.er-api.com
 ├─ CardImage ────────────────────► assets.tcgdex.net / images.pokemontcg.io
 └─ CardScanner
      ├─ /scan/embeddings* + models (estático)
      ├─ Hugging Face MobileCLIP (Transformers.js)
      ├─ Tesseract CDN / TextDetector
      └─ TCGdex REST (cardLookup)
```

---

## 11. Variáveis de ambiente

Arquivo de referência: `.env.example`

| Variável | Serviço | Obrigatória? |
|----------|---------|--------------|
| `VITE_SUPABASE_URL` | Supabase | Sim, para login / nuvem / social / collab |
| `VITE_SUPABASE_ANON_KEY` | Supabase | Sim, idem |

Nenhuma outra API key é necessária no projeto:

- TCGdex, CDNs, open.er-api.com, Hugging Face e Tesseract são públicos.
- No dashboard Supabase → Authentication → URL Configuration:
  - Site URL: `http://localhost:5173` (dev) ou URL de produção
  - Redirect URLs: `http://localhost:5173/**` e URL de produção

Na Vercel, as mesmas variáveis devem estar em **Project Settings → Environment Variables**.

---

## Resumo rápido por feature

| Feature | APIs envolvidas |
|---------|-----------------|
| Login / cadastro / magic link | Supabase Auth |
| Sync binders / inventário / decks | Supabase Postgres (`user_*`) |
| Link público `/share/:token` | Supabase `share_links` |
| Perfil, amigos, publicar | Supabase `profiles` / `follows` / `published_resources` / Storage |
| Fichário colaborativo | Supabase tabelas + RPC + Realtime |
| Buscar / detalhar cartas | TCGdex SDK |
| Preço em R$ | Supabase `card_prices` → TCGdex → **Pokémon TCG API** + open.er-api.com |
| Arte da carta | assets.tcgdex.net (+ fallback pokemontcg.io) |
| Scanner por câmera | HF MobileCLIP + Tesseract + `/scan/*` + TCGdex REST |
| Boosters sealed | Dados locais (sem API) |

---

*Documento gerado a partir do código-fonte do repositório PokéBinder (Vite + React SPA).*
