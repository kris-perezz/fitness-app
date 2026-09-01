-- Three functions that move work off the round trip (S32/S33/S45).
--
-- The session screen was reading every prior slot for every lift in the
-- session, with all their sets nested, and folding them in JavaScript. That
-- payload grows with your training history for ever: six years in, opening a
-- six-lift session dragged a large share of every set ever logged over the
-- wire so the page could display three numbers per lift. Adding a seventh lift
-- made it worse, which is why ADDING an exercise was the slowest thing the
-- screen did.
--
-- Nothing here caches or denormalises. Every function reads the real rows on
-- every call, so a deleted or edited set is reflected immediately and there is
-- no second copy of the truth to drift. What changes is only WHERE the work
-- happens and HOW MUCH crosses the network.
--
-- All three are SECURITY INVOKER (the default) so the caller's RLS policies
-- still apply -- these can only ever see the caller's own history, exactly as
-- the queries they replace could.

-- --------------------------------------------------------------- bests
-- The SQL twin of foldBest/estimated1RM in src/lib/training.ts. The two must
-- agree, so the arithmetic is written out in the same shape rather than
-- cleverly refactored:
--
--   * working sets only -- not skipped, not a warm-up (isWorkingSet)
--   * reps > 0, or there is nothing to estimate from
--   * a single returns the load exactly; Brzycki otherwise, reps clamped at 36
--   * <= 10 reps and > 10 reps are ranked in separate bands and NEVER compared,
--     because an estimate off a set of thirty is not a number about strength
--
-- Returns one row per exercise. Absent exercises simply have no row; the caller
-- treats that as NO_BESTS, which is not the same as a zero it computed.
create or replace function public.exercise_bests(
  p_exercise_ids     text[],
  p_before           date,
  p_exclude_workout  uuid
)
returns table (exercise_id text, e1rm numeric, rep_band numeric, single numeric)
language sql
stable
as $$
  with working as (
    select we.exercise_id,
           s.reps,
           s.load_lb,
           case
             when s.reps = 1 then s.load_lb
             else (s.load_lb * 36) / (37 - least(s.reps, 36))
           end as e
      from public.workout_sets s
      join public.workout_exercises we on we.id = s.workout_exercise_id
      join public.workouts w on w.id = we.workout_id
     where we.exercise_id = any (p_exercise_ids)
       and we.workout_id is distinct from p_exclude_workout
       and w.log_date < p_before
       and s.skipped = false
       and s.set_type <> 'warmup'
       and s.reps > 0
  )
  select exercise_id,
         coalesce(max(e) filter (where reps <= 10), 0),
         coalesce(max(e) filter (where reps >  10), 0),
         coalesce(max(load_lb) filter (where reps = 1), 0)
    from working
   group by exercise_id;
$$;

-- -------------------------------------------------------- last session
-- The newest prior slot per exercise, and nothing else (S42/S45). This is the
-- part that genuinely needs real set rows, so it returns the SLOT IDS and the
-- caller fetches sets for just those -- one slot per lift instead of every slot
-- that lift has ever had.
--
-- distinct on is why this is a function: PostgREST cannot express it, and
-- without it "the newest one" means fetching all of them and discarding the
-- rest on the client, which is the bug this migration exists to fix.
create or replace function public.last_session_slots(
  p_exercise_ids     text[],
  p_before           date,
  p_exclude_workout  uuid
)
returns table (exercise_id text, workout_exercise_id uuid, log_date date)
language sql
stable
as $$
  select distinct on (we.exercise_id)
         we.exercise_id, we.id, w.log_date
    from public.workout_exercises we
    join public.workouts w on w.id = we.workout_id
   where we.exercise_id = any (p_exercise_ids)
     and we.workout_id is distinct from p_exclude_workout
     and w.log_date < p_before
     and exists (select 1 from public.workout_sets s
                  where s.workout_exercise_id = we.id)
   order by we.exercise_id, we.created_at desc;
$$;

-- ------------------------------------------------------- add exercise
-- One statement in place of five sequential round trips: ownership check,
-- catalog lookup, max(sort_order), then the insert, each waiting on the last.
--
-- name, muscle_group and the two muscle lists are copied from the catalog HERE
-- rather than being passed in, so the client cannot assert what a lift trains
-- (S32). The denormalisation is the same rule as ever: what this row says is
-- what the catalog said at the moment the exercise was added, for ever.
create or replace function public.add_workout_exercise(
  p_workout_id  uuid,
  p_exercise_id text
)
returns uuid
language plpgsql
as $$
declare new_id uuid;
begin
  -- RLS on workouts already restricts this to the caller's own sessions, so a
  -- session belonging to someone else is simply not visible and this raises.
  if not exists (select 1 from public.workouts where id = p_workout_id) then
    raise exception 'Workout not found';
  end if;

  insert into public.workout_exercises
         (workout_id, exercise_id, name, muscle_group,
          primary_muscles, secondary_muscles, sort_order)
  select p_workout_id, e.id, e.name, e.muscle_group,
         e.primary_muscles, e.secondary_muscles,
         coalesce((select max(sort_order) + 1
                     from public.workout_exercises
                    where workout_id = p_workout_id), 0)
    from public.exercises e
   where e.id = p_exercise_id
  returning id into new_id;

  if new_id is null then
    raise exception 'Exercise not found';
  end if;

  return new_id;
end $$;
