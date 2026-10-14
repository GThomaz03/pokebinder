-- Rebuild the search view so Japanese names and deck filters are queryable.
-- Drop is required because the live column order cannot be changed in place.
drop view if exists public.catalog_cards_search;

create view public.catalog_cards_search
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
  coalesce(ct_en.name, c.name) as name_en,
  c.stage,
  c.trainer_type,
  c.energy_type,
  c.effect,
  c.hp,
  c.regulation_mark,
  coalesce(ct_ja.name, c.name) as name_ja
from public.cards c
left join public.sets s on s.id = c.set_id
left join public.card_translations ct_pt on ct_pt.card_id = c.id and ct_pt.language = 'pt-BR'
left join public.card_translations ct_en on ct_en.card_id = c.id and ct_en.language = 'en'
left join public.card_translations ct_ja on ct_ja.card_id = c.id and ct_ja.language = 'ja';

grant select on public.catalog_cards_search to anon, authenticated, service_role;

notify pgrst, 'reload schema';
