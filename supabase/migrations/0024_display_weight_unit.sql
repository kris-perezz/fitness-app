-- The unit you think in (S69).
--
-- STORAGE STAYS POUNDS, ALWAYS (training open decision 1). This is a display
-- setting and nothing else: every weigh-in, every goal and every rate is stored
-- in lb and converted at the edges. Storing the chosen unit instead would make
-- the meaning of a number depend on a setting somebody can change afterwards,
-- and every historical row would silently reinterpret itself.
--
-- NOT called `weight_unit`. S69 says so explicitly and it is not fussiness:
-- `foods.weight_unit` already exists and means something completely different
-- (whether `grams_per_unit` is grams or millilitres, S40). Two columns with one
-- name in one schema is how somebody eventually reads the wrong one.
--
-- On `nutrition_settings` beside the other prescription values, because that is
-- already the one row per user this app keeps its preferences in.
alter table public.nutrition_settings
  add column if not exists display_weight_unit text not null default 'lb'
    check (display_weight_unit in ('lb', 'kg'));
