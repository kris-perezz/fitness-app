-- The weight log (S54-S57). One number a day, and the whole progress tab is
-- built on it.
--
-- The shape follows the training log deliberately, the same way 0009 followed
-- the food side: a calendar of days that have an entry, a list under it, one
-- entry per day, back-dating by picking the day. S50-S52 settled every one of
-- those questions on the train side, so they are settled here by reference.
--
-- Where this differs from `workouts`, and why:
--
--   * `(user_id, log_date)` IS the primary key, rather than a uuid plus a
--     partial unique index. On the train side a session needed its own id
--     because sets reference it; nothing ever references a weigh-in. So the
--     one-a-day rule (S54) becomes the table's shape instead of a constraint
--     bolted onto it, and there is no id column to keep in step.
--
--   * No `started_at`/`ended_at`. A weigh-in is an observation, not a session:
--     it has no duration and no in-progress state.
--
-- Pounds in the column, per training open decision 1 -- one canonical unit,
-- converted at the edges if S69 ever lands. A kg display setting must not put a
-- second unit in here, or two rows stop being comparable.
create table if not exists public.weigh_ins (
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- The waking day, matching wakingDate() on the food and training sides: a
  -- 01:00 weigh-in belongs to the day you woke on.
  log_date   date not null,
  -- A scale reading, not a trend. The smoothing (S58) is a pure function over
  -- these rows and is stored nowhere -- one representation of the fact, so
  -- there is no second copy to drift. Checked positive because 0 lb is a
  -- mistyped entry every time, never a measurement.
  weight_lb  numeric not null check (weight_lb > 0),
  -- Optional and unprompted. Not shown in a list row; it exists so "post-
  -- holiday, high sodium" can sit beside a reading the trend will otherwise
  -- make look like a real gain.
  note       text,
  created_at timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- The list and the calendar both read a month of one user's entries, newest
-- first. The primary key already leads with user_id, but it orders log_date
-- ASCENDING, so this index is what keeps the list read from sorting.
create index if not exists weigh_ins_user_date
  on public.weigh_ins (user_id, log_date desc);

-- ----------------------------------------------------------------- RLS
-- Same policy shape as intake_entries (0001) and workouts (0009): own rows, all
-- verbs, checked on the way in as well as the way out.
alter table public.weigh_ins enable row level security;

create policy weigh_ins_own on public.weigh_ins for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
