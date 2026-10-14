import type { NormalizedCatalogCard } from './types'
import { mergeTranslations } from './normalizers/tcgdexNormalizer'

/** Preferred language for primary card content stored in `cards.*` columns. */
export const CONTENT_LANG_PRIORITY = ['pt', 'en', 'ja'] as const

export type ContentLang = (typeof CONTENT_LANG_PRIORITY)[number]

export function toDbLanguage(lang: string): string {
  if (lang === 'pt' || lang === 'pt-BR') return 'pt-BR'
  if (lang === 'ja') return 'ja'
  return 'en'
}

/** Merge per-language normalized cards — primary fields follow pt → en → ja. */
export function mergeCardByLanguagePriority(
  byLang: Map<string, NormalizedCatalogCard>,
): NormalizedCatalogCard | null {
  let primary: NormalizedCatalogCard | undefined
  for (const lang of CONTENT_LANG_PRIORITY) {
    const norm = byLang.get(lang)
    if (norm) {
      primary = norm
      break
    }
  }
  if (!primary) return null

  const allTranslations = [...byLang.values()].flatMap((n) => n.translations)
  return {
    ...primary,
    language: toDbLanguage(primary.language),
    translations: mergeTranslations([], allTranslations),
  }
}
