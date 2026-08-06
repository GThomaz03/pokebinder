import lists from './dexTemplateLists.json'

export type DexTemplateCategory = 'generation' | 'region' | 'game'

export type DexTemplate = {
  id: string
  category: DexTemplateCategory
  name: string
  shortLabel?: string
  description?: string
  /** National dex IDs in slot order. */
  dexIds: number[]
}

type ListKey = keyof typeof lists

function ids(key: ListKey): number[] {
  return (lists as Record<string, number[]>)[key] ?? []
}

function tpl(
  partial: Omit<DexTemplate, 'dexIds'> & { list: ListKey },
): DexTemplate {
  const dexIds = ids(partial.list)
  return {
    id: partial.id,
    category: partial.category,
    name: partial.name,
    shortLabel: partial.shortLabel,
    description:
      partial.description ?? `${dexIds.length} Pokémon · ordem da Pokédex`,
    dexIds,
  }
}

/** National complete — separate from category tabs. */
export const NATIONAL_TEMPLATE: DexTemplate = tpl({
  id: 'national',
  category: 'generation',
  name: 'Nacional completa',
  shortLabel: 'Nacional',
  description: '1–1025 · National Dex',
  list: 'national',
})

export const DEX_TEMPLATES: DexTemplate[] = [
  // —— Geração (National slices) ——
  tpl({
    id: 'gen-1',
    category: 'generation',
    name: 'Geração 1',
    shortLabel: 'Gen 1',
    description: 'Kanto · #001–151',
    list: 'gen-1',
  }),
  tpl({
    id: 'gen-2',
    category: 'generation',
    name: 'Geração 2',
    shortLabel: 'Gen 2',
    description: 'Johto · #152–251',
    list: 'gen-2',
  }),
  tpl({
    id: 'gen-3',
    category: 'generation',
    name: 'Geração 3',
    shortLabel: 'Gen 3',
    description: 'Hoenn · #252–386',
    list: 'gen-3',
  }),
  tpl({
    id: 'gen-4',
    category: 'generation',
    name: 'Geração 4',
    shortLabel: 'Gen 4',
    description: 'Sinnoh · #387–493',
    list: 'gen-4',
  }),
  tpl({
    id: 'gen-5',
    category: 'generation',
    name: 'Geração 5',
    shortLabel: 'Gen 5',
    description: 'Unova · #494–649',
    list: 'gen-5',
  }),
  tpl({
    id: 'gen-6',
    category: 'generation',
    name: 'Geração 6',
    shortLabel: 'Gen 6',
    description: 'Kalos · #650–721',
    list: 'gen-6',
  }),
  tpl({
    id: 'gen-7',
    category: 'generation',
    name: 'Geração 7',
    shortLabel: 'Gen 7',
    description: 'Alola · #722–809',
    list: 'gen-7',
  }),
  tpl({
    id: 'gen-8',
    category: 'generation',
    name: 'Geração 8',
    shortLabel: 'Gen 8',
    description: 'Galar / Hisui · #810–905',
    list: 'gen-8',
  }),
  tpl({
    id: 'gen-9',
    category: 'generation',
    name: 'Geração 9',
    shortLabel: 'Gen 9',
    description: 'Paldea · #906–1025',
    list: 'gen-9',
  }),

  // —— Região (ordem da dex regional) ——
  tpl({
    id: 'region-kanto',
    category: 'region',
    name: 'Kanto',
    description: 'Dex regional de Kanto',
    list: 'kanto',
  }),
  tpl({
    id: 'region-johto',
    category: 'region',
    name: 'Johto',
    description: 'Dex regional de Johto (Gold/Silver)',
    list: 'original-johto',
  }),
  tpl({
    id: 'region-hoenn',
    category: 'region',
    name: 'Hoenn',
    description: 'Dex regional de Hoenn (R/S)',
    list: 'hoenn',
  }),
  tpl({
    id: 'region-sinnoh',
    category: 'region',
    name: 'Sinnoh',
    description: 'Dex regional de Sinnoh (D/P)',
    list: 'original-sinnoh',
  }),
  tpl({
    id: 'region-unova',
    category: 'region',
    name: 'Unova',
    description: 'Dex regional de Unova (B/W)',
    list: 'original-unova',
  }),
  tpl({
    id: 'region-kalos',
    category: 'region',
    name: 'Kalos',
    description: 'Central + Costeira + Montanha',
    list: 'kalos',
  }),
  tpl({
    id: 'region-alola',
    category: 'region',
    name: 'Alola',
    description: 'Dex regional de Alola (S/M)',
    list: 'original-alola',
  }),
  tpl({
    id: 'region-galar',
    category: 'region',
    name: 'Galar',
    description: 'Dex regional de Galar (base)',
    list: 'galar',
  }),
  tpl({
    id: 'region-hisui',
    category: 'region',
    name: 'Hisui',
    description: 'Dex regional de Hisui',
    list: 'hisui',
  }),
  tpl({
    id: 'region-paldea',
    category: 'region',
    name: 'Paldea',
    description: 'Dex regional de Paldea (base)',
    list: 'paldea',
  }),

  // —— Jogo ——
  tpl({
    id: 'game-kanto-rby',
    category: 'game',
    name: 'Red / Blue / Yellow',
    shortLabel: 'R/B/Y',
    description: 'Kanto Dex',
    list: 'kanto',
  }),
  tpl({
    id: 'game-letsgo',
    category: 'game',
    name: "Let's Go Pikachu / Eevee",
    shortLabel: 'LGPE',
    list: 'letsgo-kanto',
  }),
  tpl({
    id: 'game-johto-gs',
    category: 'game',
    name: 'Gold / Silver',
    shortLabel: 'G/S',
    list: 'original-johto',
  }),
  tpl({
    id: 'game-johto-crystal',
    category: 'game',
    name: 'Crystal / HGSS',
    shortLabel: 'C / HGSS',
    description: 'Johto Dex atualizada',
    list: 'updated-johto',
  }),
  tpl({
    id: 'game-hoenn-rs',
    category: 'game',
    name: 'Ruby / Sapphire',
    shortLabel: 'R/S',
    list: 'hoenn',
  }),
  tpl({
    id: 'game-hoenn-emerald',
    category: 'game',
    name: 'Emerald / ORAS',
    shortLabel: 'E / ORAS',
    list: 'updated-hoenn',
  }),
  tpl({
    id: 'game-sinnoh-dp',
    category: 'game',
    name: 'Diamond / Pearl',
    shortLabel: 'D/P',
    list: 'original-sinnoh',
  }),
  tpl({
    id: 'game-sinnoh-pt',
    category: 'game',
    name: 'Platinum / BDSP',
    shortLabel: 'Pt / BDSP',
    list: 'extended-sinnoh',
  }),
  tpl({
    id: 'game-unova-bw',
    category: 'game',
    name: 'Black / White',
    shortLabel: 'B/W',
    description: 'Unova Dex (156)',
    list: 'original-unova',
  }),
  tpl({
    id: 'game-unova-b2w2',
    category: 'game',
    name: 'Black 2 / White 2',
    shortLabel: 'B2/W2',
    description: 'Unova Dex atualizada',
    list: 'updated-unova',
  }),
  tpl({
    id: 'game-kalos-xy',
    category: 'game',
    name: 'X / Y',
    shortLabel: 'X/Y',
    description: 'Três dexes de Kalos',
    list: 'kalos',
  }),
  tpl({
    id: 'game-alola-sm',
    category: 'game',
    name: 'Sun / Moon',
    shortLabel: 'S/M',
    list: 'original-alola',
  }),
  tpl({
    id: 'game-alola-usum',
    category: 'game',
    name: 'Ultra Sun / Ultra Moon',
    shortLabel: 'US/UM',
    list: 'updated-alola',
  }),
  tpl({
    id: 'game-galar-swsh',
    category: 'game',
    name: 'Sword / Shield',
    shortLabel: 'SwSh',
    description: 'Galar (sem DLC)',
    list: 'galar',
  }),
  tpl({
    id: 'game-galar-dlc',
    category: 'game',
    name: 'Sword / Shield + DLC',
    shortLabel: 'SwSh+',
    description: 'Galar + Isle of Armor + Crown Tundra',
    list: 'galar-full',
  }),
  tpl({
    id: 'game-hisui-la',
    category: 'game',
    name: 'Legends: Arceus',
    shortLabel: 'LA',
    list: 'hisui',
  }),
  tpl({
    id: 'game-paldea-sv',
    category: 'game',
    name: 'Scarlet / Violet',
    shortLabel: 'S/V',
    description: 'Paldea (sem DLC)',
    list: 'paldea',
  }),
  tpl({
    id: 'game-kitakami',
    category: 'game',
    name: 'The Teal Mask (Kitakami)',
    shortLabel: 'Kitakami',
    list: 'kitakami',
  }),
  tpl({
    id: 'game-blueberry',
    category: 'game',
    name: 'The Indigo Disk (Blueberry)',
    shortLabel: 'Blueberry',
    list: 'blueberry',
  }),
  tpl({
    id: 'game-paldea-full',
    category: 'game',
    name: 'Scarlet / Violet + DLC',
    shortLabel: 'S/V+',
    description: 'Paldea + Kitakami + Blueberry',
    list: 'paldea-full',
  }),
]

export const DEX_TEMPLATE_CATEGORIES: {
  id: DexTemplateCategory
  label: string
}[] = [
  { id: 'generation', label: 'Geração' },
  { id: 'region', label: 'Região' },
  { id: 'game', label: 'Jogo' },
]

export function getDexTemplate(id: string): DexTemplate | undefined {
  if (id === NATIONAL_TEMPLATE.id) return NATIONAL_TEMPLATE
  return DEX_TEMPLATES.find((t) => t.id === id)
}

export function templatesByCategory(category: DexTemplateCategory): DexTemplate[] {
  return DEX_TEMPLATES.filter((t) => t.category === category)
}
