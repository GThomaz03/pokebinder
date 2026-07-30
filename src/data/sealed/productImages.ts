/**
 * Imagens de produtos selados em /public/sealed/{setId}/{productId}.{webp|jpg}
 * Preferência: foto do produto da coleção; senão, outra embalagem da mesma coleção.
 */

/** Inventário sincronizado com public/sealed (atualizar ao adicionar fotos). */
const AVAILABLE: Record<string, readonly string[]> = {
  ev1: ['etb'],
  ev2: ['box-36', 'etb'],
  ev3: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  'ev3.5': ['blister-3', 'box-18', 'etb'],
  ev4: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  'ev4.5': ['blister-3', 'box-18', 'etb'],
  ev5: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  ev6: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  'ev6.5': ['blister-3', 'box-18', 'etb', 'tin-3'],
  ev7: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  ev8: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-36', 'etb'],
  'ev8.5': ['blister-3', 'blister-4', 'box-18', 'etb', 'tin-3'],
  ev9: ['blister-3', 'blister-4', 'box-36', 'etb'],
  ev10: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-18', 'box-36', 'etb'],
  'ev10.5': ['blister-3', 'blister-4', 'etb'],
  me01: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-18', 'box-36', 'etb'],
  me02: ['booster', 'blister-1', 'blister-3', 'blister-4', 'box-18', 'box-36', 'etb'],
  'swsh12.5': ['etb'],
  swsh45: ['etb'],
}

/** Extensões possíveis no disco. */
const EXTS = ['webp', 'jpg', 'jpeg', 'png'] as const

/** Aliases do mesmo tipo de produto. */
const TYPE_ALIASES: Record<string, string[]> = {
  booster: ['blister-1'],
  'blister-1': ['booster'],
  'blister-2': ['blister-1', 'booster', 'blister-3'],
  'etb-import': ['etb'],
  'bundle-6': ['box-18'],
  tin: ['tin-3', 'mini-tin'],
  'mini-tin': ['tin-3'],
  'tin-3': ['mini-tin'],
}

/**
 * Ordem de fallback dentro da coleção (qualquer embalagem > placeholder).
 * Assim produtos sem foto específica ainda mostram a arte da coleção certa.
 */
const SET_FALLBACK_ORDER = [
  'blister-4',
  'blister-3',
  'box-36',
  'etb',
  'box-18',
  'blister-1',
  'booster',
  'bundle-6',
  'tin-3',
  'mini-tin',
] as const

function pathFor(setId: string, productId: string, ext: string): string {
  return `/sealed/${setId}/${productId}.${ext}`
}

function hasProduct(setId: string, productId: string): boolean {
  return AVAILABLE[setId]?.includes(productId) ?? false
}

/** Candidatos de URL em ordem de preferência (mesmo set apenas). */
export function getProductImageCandidates(setId: string, productId: string): string[] {
  const available = AVAILABLE[setId]
  if (!available?.length) return []

  const seen = new Set<string>()
  const ids: string[] = []

  const push = (id: string) => {
    if (!hasProduct(setId, id) || seen.has(id)) return
    seen.add(id)
    ids.push(id)
  }

  push(productId)
  for (const alt of TYPE_ALIASES[productId] ?? []) push(alt)
  for (const fb of SET_FALLBACK_ORDER) push(fb)

  const urls: string[] = []
  for (const id of ids) {
    // Prefer webp then jpg (ambos podem existir)
    for (const ext of EXTS) {
      // Só webp/jpg estão no inventário; tentamos webp e jpg sempre
      if (ext === 'webp' || ext === 'jpg') {
        urls.push(pathFor(setId, id, ext))
      }
    }
  }
  return urls
}

export function getProductImage(setId: string, productId: string): string | null {
  return getProductImageCandidates(setId, productId)[0] ?? null
}

export function setHasProductImages(setId: string): boolean {
  return (AVAILABLE[setId]?.length ?? 0) > 0
}

export function isExactProductImage(setId: string, productId: string, url: string | null): boolean {
  if (!url) return false
  return (
    url.includes(`/${setId}/${productId}.`) ||
    (TYPE_ALIASES[productId] ?? []).some((alt) => url.includes(`/${setId}/${alt}.`))
  )
}
