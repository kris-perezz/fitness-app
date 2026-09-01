-- The Canadian Nutrient File as a food source (S89).
--
-- 0007 made `source` a check constraint over five values and called it the key
-- the trust hierarchy ranks on. `cnf` is the sixth, and adding it is what
-- unblocks S91: until this runs, not one Health Canada row can be written,
-- because every insert would violate the constraint.
--
-- Why a sixth VALUE rather than a boolean beside it: the whole argument of 0007
-- is that "where did this number come from" is one question with several
-- answers, and answering it with a growing pile of flags is how you end up with
-- a row that is somehow both `off` and `cnf`.
--
-- Where it ranks (src/lib/food.ts owns the actual order, this is the reasoning):
--
--   label > seed > manual > cnf > off > recipe
--
-- ABOVE `off`, because CNF is Health Canada's own laboratory data while Open
-- Food Facts is crowd-entered and says itself that it offers no assurance of
-- accuracy -- and frequently carries the US formulation of a product sold here.
--
-- BELOW `manual` and `seed`, because both of those mean a person read the packet
-- in front of them. CNF is exact about a REFERENCE food, which may not be the
-- one you ate: "Chicken, broiler, breast, skinless, boneless, meat, roasted" is
-- a real measurement of a chicken that is not your chicken.
--
-- Below `label` for the reason open decision 2 already settled: no database
-- outranks a photograph of the panel.
--
-- In practice the rank barely fires. It breaks ties between rows sharing a
-- barcode, and CNF foods carry no barcode -- generic food is exactly the half
-- that has none. It is set correctly anyway, because the one time it does
-- matter is a case nobody will be thinking about.
alter table public.foods
  drop constraint if exists foods_source_check;

alter table public.foods
  add constraint foods_source_check
  check (source in ('seed', 'off', 'label', 'manual', 'recipe', 'cnf'));
