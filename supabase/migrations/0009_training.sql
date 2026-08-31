-- Lifting (S22-S29). The shape mirrors the food side deliberately: a shared
-- catalog anyone can read and only the author can edit, plus per-user log rows
-- that DENORMALISE what they were logged with. That last rule is the same one
-- stated in 0001 for intake_entries, in 0006 for recipes and in 0007 for food
-- corrections -- editing a definition must never rewrite history.
--
-- Open decision 1: loads are pounds everywhere, in `load_lb` and
-- `bodyweight_lb`. One canonical unit in the column and no per-row unit field,
-- the same call as storing grams throughout the food side.
--
-- Open decision 2, settled here because a migration is the thing that makes it
-- expensive: a session belongs to NOTHING. No mesocycle, no block, no plan.
-- This follows the log-first model (MacroFactor) that was chosen over the
-- mesocycle-first one (RP) precisely because the latter needs a block planner
-- to exist before the first set can be logged. Adding a nullable
-- `mesocycle_id` to `workouts` later is a cheap migration; unpicking one is not.

-- ------------------------------------------------------------- exercises
-- Shaped like `foods`: text slug id, aliases for search, shared read, edit only
-- what you created.
create table if not exists public.exercises (
  id           text primary key,
  name         text not null,
  aliases      text[] not null default '{}',
  muscle_group text not null,
  equipment    text,
  -- S29. Null means "not a bodyweight movement" -- roughly 0.65 for a pull-up.
  -- Carried now because the column is what is expensive to add later, not the
  -- arithmetic; nothing reads it yet.
  bodyweight_fraction numeric,
  -- Open decision 4, deliberately deferred. Present so that settling it later
  -- is a data question rather than a schema one.
  is_unilateral boolean not null default false,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists exercises_name_trgm
  on public.exercises using gin (to_tsvector('simple', name));

-- -------------------------------------------------------------- workouts
-- One session. `ended_at is null` is the entire "in progress" state (S26) --
-- no status column, because a second representation of the same fact is a
-- second thing that can be wrong.
create table if not exists public.workouts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  -- The waking day, matching wakingDate() on the food side: a set logged at
  -- 01:00 belongs to the day you woke on.
  log_date   date not null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  -- S29. Snapshotted per session and nullable: you did not weigh in, which is
  -- not the same as weighing zero.
  bodyweight_lb numeric,
  created_at timestamptz not null default now()
);

create index if not exists workouts_user_date
  on public.workouts (user_id, log_date desc);

-- S26. At most one session open at a time, enforced rather than assumed: the
-- train tab RESUMES an open session, and two of them would make "resume" a
-- question with no answer.
create unique index if not exists workouts_one_open
  on public.workouts (user_id) where ended_at is null;

-- ----------------------------------------------------- workout exercises
-- An ordered slot inside a session. Sets hang off THIS, not off exercise_id,
-- so the same lift twice in one session (heavy, then a back-off) stays two
-- slots. Grouping by exercise would silently merge them and corrupt exactly
-- the pre-fill S23 depends on.
create table if not exists public.workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  workout_id  uuid not null references public.workouts(id) on delete cascade,
  exercise_id text not null references public.exercises(id),
  -- Denormalised at log time, same rule as intake_entries.name and .kcal:
  -- recategorising an exercise must never rewrite past volume (S32).
  name         text not null,
  muscle_group text not null,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists workout_exercises_workout
  on public.workout_exercises (workout_id, sort_order);

-- S23's pre-fill asks "the most recent slot for this exercise", which is this
-- index read backwards.
create index if not exists workout_exercises_exercise
  on public.workout_exercises (exercise_id, created_at desc);

-- --------------------------------------------------------- workout sets
create table if not exists public.workout_sets (
  id                  uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.workout_exercises(id) on delete cascade,
  set_index           integer not null,
  -- Nullable: a row can exist before it has been filled in, which is what makes
  -- S23's pre-filled-and-confirmed flow possible.
  reps                integer,
  -- S29. Zero is a REAL answer here -- it means bodyweight only -- which is why
  -- this is `not null default 0` and `rir` below is not.
  load_lb             numeric not null default 0,
  -- S24. The null/zero distinction is load-bearing in the other direction: 0
  -- means taken to failure, null means not recorded. Collapsing them would make
  -- every unlogged set read as a max effort.
  rir                 integer,
  -- S25. A recorded refusal, not an absent row, so next week's pre-fill is not
  -- built on a lie.
  skipped             boolean not null default false,
  -- Open decision 5. The whole vocabulary is pinned now even though only
  -- 'straight' and 'warmup' are implemented, so adding drop sets later is a
  -- data migration rather than a shape one.
  set_type            text not null default 'straight'
    check (set_type in ('straight', 'warmup', 'drop', 'myorep', 'top', 'backoff')),
  created_at          timestamptz not null default now()
);

create index if not exists workout_sets_parent
  on public.workout_sets (workout_exercise_id, set_index);

-- ----------------------------------------------------------------- RLS
alter table public.exercises         enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets      enable row level security;

-- Catalog: identical policy shape to foods in 0001.
create policy exercises_read   on public.exercises for select to authenticated using (true);
create policy exercises_insert on public.exercises for insert to authenticated with check (auth.uid() = created_by);
create policy exercises_update on public.exercises for update to authenticated using (auth.uid() = created_by);

create policy workouts_own on public.workouts for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Children carry no user_id: ownership is the parent's, so the policy asks the
-- parent rather than duplicating the column (same as recipe_ingredients).
create policy workout_exercises_own on public.workout_exercises for all to authenticated
  using (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.workouts w
      where w.id = workout_exercises.workout_id and w.user_id = auth.uid()
    )
  );

create policy workout_sets_own on public.workout_sets for all to authenticated
  using (
    exists (
      select 1
        from public.workout_exercises we
        join public.workouts w on w.id = we.workout_id
       where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
        from public.workout_exercises we
        join public.workouts w on w.id = we.workout_id
       where we.id = workout_sets.workout_exercise_id and w.user_id = auth.uid()
    )
  );
