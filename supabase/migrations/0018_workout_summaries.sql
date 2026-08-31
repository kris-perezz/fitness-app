-- What the train tab's month list needs, and nothing else.
--
-- It was reading workouts -> workout_exercises -> workout_sets(*) for the whole
-- month, pulling every column of every set, to end up displaying two numbers
-- and a list of names per session. A month with seventeen sessions in it is
-- four hundred-odd full set rows crossing the wire so JavaScript can count them
-- and multiply two of their columns. Paging the calendar did that again.
--
-- Same fix as 0014, and the same reasoning: read the ANSWER, not the rows it
-- comes from. A view rather than a table, so nothing is stored that could
-- disagree with the sets it was derived from (0001's intake_days, 0017's
-- muscle_volume -- the third statement of the same rule).
--
-- Two lateral subqueries rather than one join: joining exercises AND sets to
-- workouts multiplies the rows, and array_agg over that product would repeat
-- each exercise name once per set it holds. Aggregating each side separately is
-- what keeps the names a list of exercises rather than a list of sets.
--
-- security_invoker, so the caller's RLS on workouts applies unchanged.
create view public.workout_summaries
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
       ) st on true;
