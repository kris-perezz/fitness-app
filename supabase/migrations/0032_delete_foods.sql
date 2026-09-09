-- Deleting a food from your own shelf.
--
-- The catalog could be added to and corrected but never emptied: a barcode
-- scanned off the wrong packet, a label read from a photo of somebody else's
-- lunch, a manual row typed twice -- all of them permanent. Two things stood in
-- the way, and neither was a deliberate decision.

-- ------------------------------------------------------------------ writes
--
-- 0001 wrote `foods_insert` and `foods_update` and no delete policy at all,
-- which under RLS means nobody can delete anything. The test is the same one
-- `foods_update` uses, for the same reason: the shared half of the catalog
-- (seeds, and the `cnf`/`off` rows 0029 gives back to everyone) is nobody's to
-- remove, and `created_by` is what tells the two halves apart.
create policy foods_delete on public.foods for delete to authenticated
  using (auth.uid() = created_by);

-- ----------------------------------------------------------------- entries
--
-- `intake_entries.food_id` has pointed at `foods` with no ON DELETE clause
-- since 0001, so the reference is RESTRICT and any food ever logged is
-- undeletable. Set null is what the rest of the app already assumes: an entry
-- denormalises name, macros and micros at write time (0001, S7/S19), and
-- `top_foods` (0023) says in as many words that the catalog row "may have been
-- superseded or deleted since". So the entry keeps everything it was logged
-- with and loses only the pointer, which is the same shape 0007 gave
-- `supersedes`.
alter table public.intake_entries
  drop constraint if exists intake_entries_food_id_fkey;

alter table public.intake_entries
  add constraint intake_entries_food_id_fkey
  foreign key (food_id) references public.foods(id) on delete set null;

-- `recipe_ingredients.food_id` is deliberately left RESTRICT. It is `not null`
-- because a recipe with a hole in its ingredient list has no macros, so there
-- is no null to fall back to -- the ingredient has to come out of the recipe
-- first, and the delete refusing is the correct answer rather than a gap.
