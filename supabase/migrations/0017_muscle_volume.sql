-- S32. Sets per muscle group.
--
-- A VIEW, never a stored table -- the same rule as intake_days in 0001, and for
-- the same reason: a total that is written down is a total that can disagree
-- with the rows it came from, and every set edited or deleted afterwards is a
-- chance for it to. Computed on read, it cannot drift.
--
-- Three rules, all of them S32's and all of them already argued elsewhere:
--
--  * WORKING SETS ONLY -- a warm-up counts for nothing. Note they are "sets",
--    not "hard sets": hard set is RP vocabulary and asserts proximity to
--    failure, which lives in `rir` and is deliberately not checked here. The
--    function in src/lib/training.ts is named isWorkingSet for the same reason,
--    and this predicate mirrors it exactly so the two cannot drift.
--
--  * PRIMARY 1.0, SECONDARY 0.5. Pelland et al. compared counting indirect sets
--    at 0, 0.5 and 1.0 and the half-set method had the strongest relative
--    evidence; 0013's header carries the full argument. Counting a set fully
--    everywhere triple-counts one piece of work, and counting it only for the
--    primary throws away real stimulus.
--
--  * READ FROM THE LOG, NEVER THE CATALOG. primary_muscles and secondary_muscles
--    are the columns on workout_exercises, frozen when the exercise was added.
--    Reclassifying a lift today must not rewrite what last March trained (S7 /
--    S19 / S32, the same rule stated a fourth time). This is why the join stops
--    at workout_exercises and never reaches public.exercises.
--
-- Day grain, not week. The week is a question the CALLER asks -- this week on
-- the train tab, eight of them in S82's chart -- and a view that had already
-- picked a week boundary could answer only one of them. Summing days is cheap;
-- unpicking a week is not.
--
-- security_invoker so the caller's RLS applies: workouts is already restricted
-- to its owner, so this can only ever total your own training.
create view public.muscle_volume
with (security_invoker = true) as
select w.user_id,
       w.log_date,
       m.muscle,
       sum(m.weight) as sets
  from public.workout_sets s
  join public.workout_exercises we on we.id = s.workout_exercise_id
  join public.workouts w on w.id = we.workout_id
  -- One row per (set, muscle it trained), which is what makes a set count once
  -- for each muscle rather than once overall. A lift with two primaries -- a
  -- dip, a deadlift -- produces two rows here, deliberately: that set really
  -- was direct work for both.
  cross join lateral (
         select unnest(we.primary_muscles)   as muscle, 1.0::numeric as weight
          union all
         select unnest(we.secondary_muscles) as muscle, 0.5::numeric
       ) m
 where s.skipped = false
   and s.set_type <> 'warmup'
 group by w.user_id, w.log_date, m.muscle;
