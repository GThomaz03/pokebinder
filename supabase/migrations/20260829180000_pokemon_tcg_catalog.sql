-- Pokémon TCG catalog: series, sets, cards, variants, prices, sync metadata

-- Extensions for search
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------------------
-- data_sources
-- ---------------------------------------------------------------------------
create table if not exists public.data_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  base_url text,
  type text not null default 'api',
  license text,
  enabled boolean not null default true,
  priority int not null default 100,
  last_sync_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- series
-- ---------------------------------------------------------------------------
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  language text not null default 'en',
  logo_url text,
  source text not null,
  source_id text not null,
  release_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists series_slug_idx on public.series (slug);
create index if not exists series_language_idx on public.series (language);

-- ---------------------------------------------------------------------------
-- sets
-- ---------------------------------------------------------------------------
create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references public.series (id) on delete set null,
  name text not null,
  slug text not null,
  source text not null,
  source_id text not null,
  pt_name text,
  en_name text,
  jp_name text,
  release_date date,
  symbol_url text,
  logo_url text,
  total_cards int,
  printed_total int,
  official_total int,
  serie_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists sets_series_id_idx on public.sets (series_id);
create index if not exists sets_slug_idx on public.sets (slug);
create index if not exists sets_release_date_idx on public.sets (release_date desc nulls last);
create index if not exists sets_serie_slug_idx on public.sets (serie_slug);

-- ---------------------------------------------------------------------------
-- cards
-- ---------------------------------------------------------------------------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  name text not null,
  supertype text,
  subtypes text[] not null default '{}',
  hp int,
  types text[] not null default '{}',
  evolves_from text,
  evolves_to text[] not null default '{}',
  rules text[] not null default '{}',
  rarity text,
  artist text,
  flavor_text text,
  national_pokedex_numbers int[] not null default '{}',
  number text,
  printed_number text,
  set_id uuid references public.sets (id) on delete set null,
  image_url text,
  image_high_url text,
  image_low_url text,
  legalities jsonb not null default '{}'::jsonb,
  regulation_mark text,
  language text not null default 'en',
  category text,
  stage text,
  trainer_type text,
  energy_type text,
  effect text,
  release_date date,
  source text not null,
  source_id text not null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists cards_set_id_idx on public.cards (set_id);
create index if not exists cards_number_idx on public.cards (number);
create index if not exists cards_rarity_idx on public.cards (rarity);
create index if not exists cards_category_idx on public.cards (category);
create index if not exists cards_language_idx on public.cards (language);
create index if not exists cards_source_id_idx on public.cards (source_id);
create index if not exists cards_name_trgm_idx on public.cards using gin (name extensions.gin_trgm_ops);
create index if not exists cards_types_gin_idx on public.cards using gin (types);
create index if not exists cards_dex_gin_idx on public.cards using gin (national_pokedex_numbers);

-- ---------------------------------------------------------------------------
-- card_variants
-- ---------------------------------------------------------------------------
create table if not exists public.card_variants (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  variant_type text not null,
  is_holo boolean not null default false,
  is_reverse_holo boolean not null default false,
  is_first_edition boolean not null default false,
  is_shadowless boolean not null default false,
  is_promo boolean not null default false,
  language text not null default 'en',
  printing text,
  condition_supported text[] not null default '{}',
  source text not null,
  source_id text,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists card_variants_unique_idx
  on public.card_variants (card_id, variant_type, language, coalesce(source_id, ''));

create index if not exists card_variants_card_id_idx on public.card_variants (card_id);
create index if not exists card_variants_type_idx on public.card_variants (variant_type);

-- ---------------------------------------------------------------------------
-- card_identifiers
-- ---------------------------------------------------------------------------
create table if not exists public.card_identifiers (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  source text not null,
  external_id text not null,
  external_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, external_id)
);

create index if not exists card_identifiers_card_id_idx on public.card_identifiers (card_id);

-- ---------------------------------------------------------------------------
-- card_translations
-- ---------------------------------------------------------------------------
create table if not exists public.card_translations (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  language text not null,
  name text not null,
  flavor_text text,
  rules jsonb not null default '[]'::jsonb,
  attacks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, language)
);

create index if not exists card_translations_language_idx on public.card_translations (language);
create index if not exists card_translations_name_trgm_idx on public.card_translations using gin (name extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- card_attacks / weaknesses / resistances / rules
-- ---------------------------------------------------------------------------
create table if not exists public.card_attacks (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  name text not null,
  cost text[] not null default '{}',
  damage text,
  text text,
  converted_energy_cost int,
  attack_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_attacks_card_id_idx on public.card_attacks (card_id);

create table if not exists public.card_weaknesses (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  type text not null,
  value text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_weaknesses_card_id_idx on public.card_weaknesses (card_id);

create table if not exists public.card_resistances (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  type text not null,
  value text not null,
  created_at timestamptz not null default now()
);

create index if not exists card_resistances_card_id_idx on public.card_resistances (card_id);

create table if not exists public.card_rules (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  rule_type text not null default 'ability',
  text text not null,
  rule_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists card_rules_card_id_idx on public.card_rules (card_id);

-- ---------------------------------------------------------------------------
-- card_images
-- ---------------------------------------------------------------------------
create table if not exists public.card_images (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  variant_id uuid references public.card_variants (id) on delete set null,
  source text not null,
  original_url text,
  storage_path text,
  width int,
  height int,
  quality text not null default 'high',
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists card_images_unique_idx
  on public.card_images (
    card_id,
    coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
    quality
  );

create index if not exists card_images_card_id_idx on public.card_images (card_id);
create index if not exists card_images_storage_path_idx on public.card_images (storage_path) where storage_path is not null;

-- ---------------------------------------------------------------------------
-- card_prices / history
-- ---------------------------------------------------------------------------
create table if not exists public.card_prices (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  source text not null,
  market text not null,
  low numeric,
  mid numeric,
  high numeric,
  currency text not null default 'EUR',
  condition text,
  variant text,
  observed_at timestamptz not null default now()
);

create unique index if not exists card_prices_unique_idx
  on public.card_prices (card_id, source, market, coalesce(variant, ''), coalesce(condition, ''));

create index if not exists card_prices_card_id_idx on public.card_prices (card_id);
create index if not exists card_prices_observed_at_idx on public.card_prices (observed_at desc);

create table if not exists public.card_price_history (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  source text not null,
  price numeric not null,
  currency text not null default 'EUR',
  condition text,
  variant text,
  snapshot_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists card_price_history_card_date_idx on public.card_price_history (card_id, snapshot_date desc);

-- ---------------------------------------------------------------------------
-- sync_jobs / sync_errors / sync_checkpoints / set_coverage
-- ---------------------------------------------------------------------------
create table if not exists public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.data_sources (id) on delete set null,
  job_type text not null,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'completed', 'partial', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  records_found int not null default 0,
  records_created int not null default 0,
  records_updated int not null default 0,
  records_skipped int not null default 0,
  records_failed int not null default 0,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sync_jobs_status_idx on public.sync_jobs (status, created_at desc);

create table if not exists public.sync_errors (
  id uuid primary key default gen_random_uuid(),
  sync_job_id uuid references public.sync_jobs (id) on delete cascade,
  source text not null,
  external_id text,
  endpoint text,
  error_type text not null,
  status_code int,
  message text not null,
  payload jsonb,
  retry_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists sync_errors_job_idx on public.sync_errors (sync_job_id);
create index if not exists sync_errors_source_idx on public.sync_errors (source, created_at desc);

create table if not exists public.sync_checkpoints (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  entity_type text not null,
  entity_id text not null,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (source, entity_type, entity_id)
);

create index if not exists sync_checkpoints_status_idx on public.sync_checkpoints (source, status);

create table if not exists public.set_coverage (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets (id) on delete cascade unique,
  expected_cards int not null default 0,
  imported_cards int not null default 0,
  missing_cards int not null default 0,
  last_checked_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Search view (public card lookup by canonical_id)
-- ---------------------------------------------------------------------------
create or replace view public.catalog_cards_search
with (security_invoker = true) as
select
  c.id,
  c.canonical_id,
  c.name,
  c.number,
  c.rarity,
  c.category,
  c.types,
  c.language,
  c.image_low_url,
  c.image_high_url,
  c.image_url,
  c.national_pokedex_numbers as dex_id,
  c.set_id,
  s.source_id as set_source_id,
  s.name as set_name,
  s.en_name as set_en_name,
  s.pt_name as set_pt_name,
  s.serie_slug,
  coalesce(ct_pt.name, c.name) as name_pt,
  coalesce(ct_en.name, c.name) as name_en
from public.cards c
left join public.sets s on s.id = c.set_id
left join public.card_translations ct_pt on ct_pt.card_id = c.id and ct_pt.language = 'pt-BR'
left join public.card_translations ct_en on ct_en.card_id = c.id and ct_en.language = 'en';

-- ---------------------------------------------------------------------------
-- Admin helper (uses app_metadata, NOT user_metadata)
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to anon;

-- ---------------------------------------------------------------------------
-- RLS: catalog read-only for anon/authenticated; writes via service role only
-- ---------------------------------------------------------------------------
alter table public.data_sources enable row level security;
alter table public.series enable row level security;
alter table public.sets enable row level security;
alter table public.cards enable row level security;
alter table public.card_variants enable row level security;
alter table public.card_identifiers enable row level security;
alter table public.card_translations enable row level security;
alter table public.card_attacks enable row level security;
alter table public.card_weaknesses enable row level security;
alter table public.card_resistances enable row level security;
alter table public.card_rules enable row level security;
alter table public.card_images enable row level security;
alter table public.card_prices enable row level security;
alter table public.card_price_history enable row level security;
alter table public.sync_jobs enable row level security;
alter table public.sync_errors enable row level security;
alter table public.sync_checkpoints enable row level security;
alter table public.set_coverage enable row level security;

-- Public read on catalog tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources', 'series', 'sets', 'cards', 'card_variants',
    'card_identifiers', 'card_translations', 'card_attacks',
    'card_weaknesses', 'card_resistances', 'card_rules', 'card_images',
    'card_prices', 'card_price_history', 'set_coverage'
  ] loop
    execute format(
      'create policy "catalog_public_read" on public.%I for select to anon, authenticated using (true)',
      t
    );
  end loop;
end $$;

-- Sync metadata: admins only
create policy "sync_jobs_admin_read"
  on public.sync_jobs for select to authenticated
  using (public.is_admin());

create policy "sync_errors_admin_read"
  on public.sync_errors for select to authenticated
  using (public.is_admin());

create policy "sync_checkpoints_admin_read"
  on public.sync_checkpoints for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Storage: card-images bucket (public read)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'card-images',
  'card-images',
  true,
  5242880,
  array['image/webp', 'image/png', 'image/jpeg', 'image/avif']
)
on conflict (id) do nothing;

create policy "card_images_public_read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'card-images');

-- ---------------------------------------------------------------------------
-- Seed data sources
-- ---------------------------------------------------------------------------
insert into public.data_sources (name, base_url, type, license, enabled, priority, metadata)
values
  (
    'tcgdex',
    'https://api.tcgdex.net/v2',
    'api',
    'MIT (cards-database)',
    true,
    10,
    '{"repo":"https://github.com/tcgdex/cards-database","languages":["en","pt","ja","fr","de","es","it"],"fields":["series","sets","cards","variants","translations","pricing","images"]}'::jsonb
  ),
  (
    'pokemon_tcg_api',
    'https://api.pokemontcg.io/v2',
    'api',
    'See PokemonTCG/pokemon-tcg-data',
    true,
    20,
    '{"fields":["cards","sets","pricing"],"note":"Secondary source for cross-IDs"}'::jsonb
  ),
  (
    'liga_pokemon',
    'https://www.ligapokemon.com.br',
    'marketplace',
    null,
    false,
    90,
    '{"status":"deferred","reason":"No official API; scraping not permitted"}'::jsonb
  ),
  (
    'manual',
    null,
    'manual',
    null,
    true,
    100,
    '{"note":"CSV/JSON manual imports"}'::jsonb
  )
on conflict (name) do nothing;
