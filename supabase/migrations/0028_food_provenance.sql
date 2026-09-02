-- Provenance that survives a correction, and a catalog that stays yours (S97).
--
-- TWO PROBLEMS, ONE ROW. `updateFood` collapses every source but `label` to
-- `manual` when you edit a food. That was a deliberate call -- after you have
-- retyped the numbers they are yours, not the database's -- and it is right
-- about `off` and `seed`. It is wrong about `cnf`, because `sourceHint` carries
-- the Open Government Licence attribution as a LICENCE OBLIGATION rather than
-- as editorial, and relabelling the row silently dropped it.
--
-- Keeping the row `cnf` would have been the cheap fix and a worse one: the hint
-- would go on claiming "laboratory values from the Canadian Nutrient File" over
-- numbers you had overwritten by hand. So the source tells the truth (`manual`)
-- and `derived_from` remembers what it descended from, which is what the
-- attribution actually attaches to.
--
-- NOT a second source column. `source` answers "how good are these numbers
-- now"; `derived_from` answers "what did they start as", and only the first one
-- ranks. 0007's argument against a pile of booleans is untouched -- this is one
-- nullable ancestry pointer, not a second answer to the same question.
alter table public.foods
  add column if not exists derived_from text;

-- The same six values `source` allows, and null for a row that descends from
-- nothing. Not a foreign key to `foods.id`: `supersedes` (0007) already points
-- at the specific row, and this points at the KIND of thing it was, which
-- outlives the row it was forked from.
alter table public.foods
  drop constraint if exists foods_derived_from_check;

alter table public.foods
  add constraint foods_derived_from_check
  check (derived_from is null or derived_from in ('seed', 'off', 'label', 'manual', 'recipe', 'cnf'));

-- ------------------------------------------------------------------ reads
--
-- 0001 made the catalog readable by every signed-in user, which is right for
-- the seeded rows and wrong for everything since. A correction forks a private
-- row (0007), and a fork of someone else's food carrying your numbers, your
-- name for it and your typo has no business in their search results. The same
-- goes for every CNF pick, label transcription and Open Food Facts save: those
-- are one person's catalog, accumulated by one person's logging.
--
-- `created_by is null` IS the seed marker -- 0002 and 0010 both establish it,
-- and 0007 relies on it (`update ... set source = 'seed' where created_by is
-- null`). So the shared half of the catalog stays shared and the personal half
-- stops leaking.
--
-- Consequence worth stating: an entry logged against a food you can no longer
-- see keeps its numbers, because `intake_entries` denormalises them at write
-- time (0001). What it loses is the edit affordance, which is correct -- you
-- could never have edited that row anyway (`foods_update` is scoped to
-- `created_by`).
drop policy if exists foods_read on public.foods;

create policy foods_read on public.foods for select to authenticated
  using (created_by is null or created_by = auth.uid());
