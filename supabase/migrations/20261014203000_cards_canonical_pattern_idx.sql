-- LIKE 'setId-%' is case-sensitive and must use a pattern index.
-- The default text index compares with a case-folding collation, so a range
-- scan would mix sm12 with SM12, and an unindexed LIKE scans every card.
create index if not exists cards_canonical_id_pattern_idx
  on public.cards (canonical_id text_pattern_ops);
