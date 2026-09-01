-- One session per day (S52), and the index that makes "add a session" mean
-- "open that day's session, creating it if it does not exist yet".
--
-- Two buttons -- "Start today's session" and "Add a past session" -- were the
-- symptom of not having decided this. With at most one session per day, picking
-- a date is the whole interaction: there is exactly one thing that date can
-- refer to, so there is nothing left to choose between.
--
-- A two-a-day is logged as one session. Slot order still records the sequence,
-- and nothing in the app consumes an AM/PM split -- not volume (S32), not PR
-- detection (S33), not the S45 suggestion, which asks about the last time an
-- EXERCISE was trained rather than about session boundaries.
--
-- Chosen in this direction because it is the reversible one: dropping this
-- index later is trivial, while adding it later would mean deduplicating real
-- logged history first. Same reasoning as open decision 2.

-- Defensive: a duplicate can only exist if a session was added twice before
-- this migration, in which case the index below would fail to build and take
-- the migration with it. Keep the earliest row for each day -- it is the one
-- the calendar has been linking to -- and re-parent its sets rather than
-- dropping them.
with ranked as (
  select id,
         user_id,
         log_date,
         row_number() over (partition by user_id, log_date order by started_at, id) as n,
         first_value(id) over (partition by user_id, log_date order by started_at, id) as keep_id
    from public.workouts
)
update public.workout_exercises we
   set workout_id = ranked.keep_id
  from ranked
 where ranked.n > 1
   and we.workout_id = ranked.id;

delete from public.workouts w
 using (
   select id,
          row_number() over (partition by user_id, log_date order by started_at, id) as n
     from public.workouts
 ) ranked
 where ranked.n > 1
   and w.id = ranked.id;

create unique index if not exists workouts_one_per_day
  on public.workouts (user_id, log_date);

-- `workouts_one_open` from 0009 stays. It is a different claim -- at most one
-- session is IN PROGRESS -- and it is what keeps S26's "resume" with exactly
-- one answer. The two indexes overlap only in that both are satisfied by the
-- ordinary case of one open session, today.
