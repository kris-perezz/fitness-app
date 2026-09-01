-- What the number in `load_lb` MEANS for a given lift (S49).
--
-- Nobody logs a 35 lb dumbbell lateral raise as 70. The convention everywhere
-- in lifting is that you record the weight of the implement in one hand, and by
-- the same convention a plate-loaded machine at 70 per arm is 70, not 140.
-- Normalising to a total would make the app disagree with what you typed, for
-- no gain: every comparison the app makes -- the S45 suggestion, S33's PRs,
-- session volume -- compares a lift against ITSELF, so a consistent convention
-- is all any of them need. This is learning 12 from the food side restated:
-- a biased-but-stable measure beats an unbiased-but-noisy one.
--
-- So nothing is doubled anywhere. The column exists to LABEL the field at the
-- point of entry, so the same lift is never logged 140 one week and 70 the
-- next -- which is the failure that actually corrupts a series.
--
-- It cannot ride on `is_unilateral`, which answers a different question (one
-- row per set, or one per side -- open decision 4, still deferred): a dumbbell
-- bench press is not unilateral and is still logged per dumbbell. Nor can it be
-- derived from `equipment`, because a plate-loaded chest press is a 'Machine'
-- and a cable stack is a 'Cable', and only one of those is per side.

alter table public.exercises
  add column if not exists load_is_per_side boolean not null default false;

-- Every dumbbell movement in the seed follows the per-hand convention, as does
-- the single-arm cable lateral raise, which loads one stack for one arm.
-- Everything else -- barbells, cable stacks, and the machine entries as seeded
-- -- is a single number for the whole movement.
update public.exercises
   set load_is_per_side = true
 where equipment = 'Dumbbell'
    or id = 'cable_lateral_raise';
