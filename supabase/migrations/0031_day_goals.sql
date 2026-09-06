-- The goal a day was logged under, kept on the day (S38's rule applied to
-- the target rather than to the food).
--
-- `nutrition_settings` holds one live row per user, and every screen reads it
-- for whatever date is on screen -- so raising today's calorie goal silently
-- re-grades every day already logged against a number that was never the
-- target on those days. That is the one rule this schema has been built
-- around since 0001: an entry keeps what it was logged with, and a later
-- correction must not rewrite history. A day's goal is a fact about that day
-- in exactly the same way, and it belongs beside `intake_entries`, not only
-- in the one row every screen currently reads live.
--
-- The same four columns `nutrition_settings` carries for a goal, same types,
-- same nullability, same defaults -- this is a dated copy of that data, not a
-- redesign of it. `strict_mode` is deliberately NOT here and never will be:
-- S77 is explicit that the tone owns no data, and dating it would mean
-- flipping it back could no longer restore calm on a day logged while it was
-- on. The weight goal and rate (S60) stay on `nutrition_settings` too --
-- those describe a body's trajectory, not a day's food, and dating them is a
-- different story if one is ever wanted.
--
-- NO BACKFILL. A day logged before this shipped has no row here and grades
-- against nothing -- the same state a user who has never opened the goals
-- tab is already in. Inventing a row for the past would assert a target that
-- was never actually on file that day.
create table public.day_goals (
  user_id        uuid not null references auth.users(id) on delete cascade,
  log_date       date not null,
  calorie_goal   numeric not null default 2000,
  protein_goal_g numeric not null default 150,
  carb_goal_g    numeric not null default 200,
  fat_goal_g     numeric not null default 65,
  created_at     timestamptz not null default now(),
  primary key (user_id, log_date)
);

-- ----------------------------------------------------------------- RLS
-- Same shape as weigh_ins (0020) and nutrition_settings (0001): own rows, all
-- verbs, checked on the way in as well as the way out.
alter table public.day_goals enable row level security;

create policy day_goals_own on public.day_goals for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
