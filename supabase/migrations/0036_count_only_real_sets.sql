-- A set with no reps (or zero) counted as a full working set in muscle volume
-- and the session's set count. Only sets with at least one rep count now.
create or replace view public.muscle_volume
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
   and coalesce(s.reps, 0) > 0
 group by w.user_id, w.log_date, m.muscle;

create or replace view public.workout_summaries
with (security_invoker = true) as
select w.user_id,
       w.id,
       w.log_date,
       w.ended_at,
       coalesce(ex.names, '{}') as exercises,
       coalesce(st.set_count, 0) as set_count,
       -- Rounded here rather than in the client: it is a figure for comparing
       -- sessions to each other, and the fractional pound was never meaningful.
       -- Summed as logged (S49) -- per-side work counts once, which is a
       -- convention for comparison, not a claim about physics.
       coalesce(round(st.volume_lb), 0) as volume_lb
  from public.workouts w
  left join lateral (
         select array_agg(we.name order by we.sort_order) as names
           from public.workout_exercises we
          where we.workout_id = w.id
       ) ex on true
  left join lateral (
         select count(*) as set_count,
                sum(s.load_lb * coalesce(s.reps, 0)) as volume_lb
           from public.workout_exercises we
           join public.workout_sets s on s.workout_exercise_id = we.id
          where we.workout_id = w.id
            -- Working sets only: a warm-up is in the history and out of the
            -- totals. Mirrors isWorkingSet in src/lib/training.ts exactly, as
            -- 0017 does, so the two cannot drift.
            and s.skipped = false
            and s.set_type <> 'warmup'
            and coalesce(s.reps, 0) > 0
       ) st on true;
