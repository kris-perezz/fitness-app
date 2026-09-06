-- A short title and the fuller description it came from (S100).
--
-- Today an estimate's whole typed-or-inferred sentence lands in `name`, so the
-- log tab is a wall of prose instead of a list of dishes. The estimator now
-- names the dish separately from describing it -- "chicken adobo" rather than
-- "chicken thighs braised in soy sauce and vinegar, about two cups" -- and
-- `name` keeps that short title. This column keeps the longer description
-- alongside it, shown only where there is room to read it.
--
-- Nullable, and every row logged before this shipped has none: a null
-- description is not a missing fact, it is a fact about entries that never
-- had one, and they render exactly as they always have.
alter table public.intake_entries
  add column if not exists description text;
