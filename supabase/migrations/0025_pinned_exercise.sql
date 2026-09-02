-- One lift on the progress tab (S81).
--
-- EXACTLY ONE, and nullable. The pin is a statement of what this block is for,
-- so a list of every exercise charted would be the catalog again and would turn
-- the tab back into the dumping ground S67 spent its whole story avoiding. No
-- pin is a normal state: Progress simply omits the block.
--
-- A COLUMN, not a join table. A join table is the shape for "many", and the
-- moment it exists somebody adds a second row -- the constraint is the feature
-- here, and a single nullable column enforces it without a trigger.
--
-- On `nutrition_settings` beside the other prescription values, which is
-- already the one-row-per-user table this app keeps preferences in.
--
-- `on delete set null` rather than cascade: deleting an exercise should unpin
-- it, never delete the settings row that happened to point at it.
alter table public.nutrition_settings
  add column if not exists pinned_exercise_id text
    references public.exercises(id) on delete set null;
