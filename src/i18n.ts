import type { CardLang } from './types'

export const LANG_OPTIONS: { value: CardLang; label: string; short: string }[] = [
  { value: 'pt', label: 'Português', short: 'PT' },
  { value: 'en', label: 'English', short: 'EN' },
  { value: 'ja', label: '日本語', short: 'JP' },
]

export const ui = {
  brand: 'PokéBinder',
  tagline: 'Seu binder digital — o que você tem e o que falta',
  nav: {
    home: 'Início',
    sets: 'Coleções',
    search: 'Buscar',
  },
  home: {
    title: 'Organize sua coleção',
    subtitle:
      'Marque cartas que você tem, veja as que faltam e navegue sets em português, inglês ou japonês.',
    cta: 'Ver coleções',
    statsOwned: 'Cartas marcadas',
    statsSets: 'Sets com progresso',
    featureLang: 'Dataset em português',
    featureLangDesc: 'Nomes e imagens das cartas oficiais em PT-BR via TCGdex.',
    featureBinder: 'Binder em grade',
    featureBinderDesc: 'Layouts 2×2, 3×3, 3×4 e 4×4 como um binder físico.',
    featureTrack: 'Tem / falta',
    featureTrackDesc: 'Toque na carta para marcar. Progresso salvo neste navegador.',
  },
  sets: {
    title: 'Coleções',
    search: 'Buscar set…',
    cards: 'cartas',
    owned: 'possuídas',
    empty: 'Nenhum set encontrado.',
    loading: 'Carregando sets…',
    error: 'Não foi possível carregar os sets. Tente de novo.',
  },
  binder: {
    page: 'Página',
    of: 'de',
    layout: 'Layout',
    filter: 'Filtro',
    all: 'Todas',
    owned: 'Tenho',
    missing: 'Faltam',
    progress: 'Progresso',
    markAll: 'Marcar página',
    unmarkAll: 'Desmarcar página',
    back: 'Voltar aos sets',
    loading: 'Abrindo binder…',
    error: 'Não foi possível carregar este set.',
    noImage: 'Sem imagem',
    tip: 'Clique na carta para marcar/desmarcar',
  },
  search: {
    title: 'Buscar cartas',
    placeholder: 'Nome da carta…',
    submit: 'Buscar',
    empty: 'Digite um nome para buscar.',
    none: 'Nenhuma carta encontrada.',
    loading: 'Buscando…',
  },
  lang: 'Idioma das cartas',
  disclaimer:
    'Não afiliado à Nintendo / The Pokémon Company. Dados via TCGdex.',
} as const
