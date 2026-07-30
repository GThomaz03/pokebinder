import type { SealedProduct, SealedProductType } from '../../types/sealed'

/** Templates genéricos (`setId: '*'`) — aplicáveis a qualquer coleção. */
export const SEALED_PRODUCTS: SealedProduct[] = [
  // Boosters / blisters
  {
    id: 'booster',
    setId: '*',
    name: 'Booster avulso',
    type: 'booster',
    packCount: 1,
  },
  {
    id: 'blister-1',
    setId: '*',
    name: 'Blister / Checklane (1 booster)',
    type: 'blister',
    packCount: 1,
    notes: 'Pode incluir carta promo ou moeda (não valorados)',
  },
  {
    id: 'blister-2',
    setId: '*',
    name: 'Blister dual (2 boosters)',
    type: 'blister',
    packCount: 2,
    notes: 'Pode incluir carta promo (não valorada)',
  },
  {
    id: 'blister-3',
    setId: '*',
    name: 'Blister triple (3 boosters)',
    type: 'blister',
    packCount: 3,
    notes: 'Pode incluir carta promo (não valorada)',
  },
  {
    id: 'blister-4',
    setId: '*',
    name: 'Blister quad (4 boosters)',
    type: 'blister',
    packCount: 4,
    notes: 'Pode incluir carta promo (não valorada)',
  },

  // Bundles e boxes
  {
    id: 'bundle-6',
    setId: '*',
    name: 'Booster Bundle (6 boosters)',
    type: 'booster_bundle',
    packCount: 6,
  },
  {
    id: 'box-18',
    setId: '*',
    name: 'Mini Display / Combo (18 boosters)',
    type: 'booster_box',
    packCount: 18,
  },
  {
    id: 'box-36',
    setId: '*',
    name: 'Booster Box / Display (36 boosters)',
    type: 'booster_box',
    packCount: 36,
  },

  // ETB — no Brasil a Coleção Treinador Avançado traz 20 boosters
  {
    id: 'etb',
    setId: '*',
    name: 'Coleção Treinador Avançado (ETB)',
    type: 'etb',
    packCount: 20,
    notes: 'Versão BR: 20 boosters + sleeves, dados etc. (extras não valorados)',
  },
  {
    id: 'etb-import',
    setId: '*',
    name: 'ETB importado (9 boosters)',
    type: 'etb',
    packCount: 9,
    notes: 'ETB americano/europeu típico; extras não valorados',
  },

  // Tins
  {
    id: 'mini-tin',
    setId: '*',
    name: 'Mini Tin (2 boosters)',
    type: 'tin',
    packCount: 2,
    notes: 'Inclui moeda / artefacto (não valorados)',
  },
  {
    id: 'tin-3',
    setId: '*',
    name: 'Tin (3 boosters)',
    type: 'tin',
    packCount: 3,
    notes: 'Inclui moeda / artefacto (não valorados)',
  },

  // Collection / specialty
  {
    id: 'collection-4',
    setId: '*',
    name: 'Collection Box (4 boosters)',
    type: 'collection_box',
    packCount: 4,
    notes: 'Extras (promo, accessories) não valorados',
  },
  {
    id: 'collection-5',
    setId: '*',
    name: 'Collection Box (5 boosters)',
    type: 'collection_box',
    packCount: 5,
    notes: 'Extras (promo, accessories) não valorados',
  },
  {
    id: 'collection-6',
    setId: '*',
    name: 'Special Collection (6 boosters)',
    type: 'collection_box',
    packCount: 6,
    notes: 'Extras (promo, accessories) não valorados',
  },
  {
    id: 'collection-8',
    setId: '*',
    name: 'Special Collection (8 boosters)',
    type: 'collection_box',
    packCount: 8,
    notes: 'Extras (promo, accessories) não valorados',
  },

  // Build & Battle
  {
    id: 'bnb',
    setId: '*',
    name: 'Build & Battle Box',
    type: 'build_battle',
    packCount: 4,
    notes: 'Inclui deck pré-construído + promo stamp (não valorados)',
  },
  {
    id: 'bnb-stadium',
    setId: '*',
    name: 'Build & Battle Stadium',
    type: 'build_battle',
    packCount: 8,
    notes: '2× Build & Battle + boosters extras; extras não valorados',
  },

  // Premium
  {
    id: 'premium-5',
    setId: '*',
    name: 'Premium Collection (5 boosters)',
    type: 'premium_collection',
    packCount: 5,
    notes: 'Figura / playmat / promo (não valorados)',
  },
  {
    id: 'premium-6',
    setId: '*',
    name: 'Premium Collection (6 boosters)',
    type: 'premium_collection',
    packCount: 6,
    notes: 'Figura / playmat / promo (não valorados)',
  },
  {
    id: 'premium-8',
    setId: '*',
    name: 'Premium Collection (8 boosters)',
    type: 'premium_collection',
    packCount: 8,
    notes: 'Figura / playmat / promo (não valorados)',
  },
  {
    id: 'upc',
    setId: '*',
    name: 'Ultra-Premium Collection',
    type: 'ultra_premium',
    packCount: 16,
    notes: 'Contagem típica 16 boosters; metal cards / extras não valorados',
  },
  {
    id: 'upc-15',
    setId: '*',
    name: 'Ultra-Premium Collection (15 boosters)',
    type: 'ultra_premium',
    packCount: 15,
    notes: 'Algumas UPCs trazem 15; extras não valorados',
  },

  // Poster / binder
  {
    id: 'poster',
    setId: '*',
    name: 'Poster Collection',
    type: 'poster_collection',
    packCount: 3,
    notes: 'Inclui pôster (não valorado)',
  },
  {
    id: 'binder-coll',
    setId: '*',
    name: 'Binder Collection',
    type: 'binder_collection',
    packCount: 4,
    notes: 'Inclui binder (não valorado)',
  },

  // Outros contagens úteis
  {
    id: 'other-10',
    setId: '*',
    name: 'Caixa / kit (10 boosters)',
    type: 'other',
    packCount: 10,
  },
  {
    id: 'other-12',
    setId: '*',
    name: 'Caixa / kit (12 boosters)',
    type: 'other',
    packCount: 12,
  },
]

export const PRODUCT_TYPE_LABELS: Record<SealedProductType, string> = {
  booster: 'Booster',
  blister: 'Blister',
  booster_bundle: 'Bundle',
  booster_box: 'Booster Box',
  etb: 'ETB',
  tin: 'Tin',
  collection_box: 'Collection',
  build_battle: 'Build & Battle',
  premium_collection: 'Premium',
  ultra_premium: 'Ultra-Premium',
  poster_collection: 'Poster',
  binder_collection: 'Binder',
  other: 'Outro',
}

/** Produtos disponíveis para uma coleção (templates + específicos do set). */
export function productsForSet(setId: string): SealedProduct[] {
  return SEALED_PRODUCTS.filter((p) => p.setId === '*' || p.setId === setId)
}

export function getSealedProduct(id: string): SealedProduct | undefined {
  return SEALED_PRODUCTS.find((p) => p.id === id)
}
