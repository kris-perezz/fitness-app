-- More than one lift on the progress tab (S81 revisited).
--
-- 0025 argued for exactly one, and the argument was about the TAB rather than
-- about the data: a list of every exercise charted would be the catalog again,
-- and S67 spent a whole story keeping Progress from becoming that. It backed
-- the rule with a single nullable column, so the constraint needed no trigger.
--
-- What it got wrong is that one is not the only number that is not "all". Two
-- or three lifts are the ones somebody is actually running a block on, and a
-- column cannot express that at all -- it can only express one or none. The
-- shape has to be a table; the restraint moves to the user, who has to pin each
-- one deliberately and can unpin it from the same place.
--
-- Ordered by when it was pinned, oldest first, so a new pin joins the bottom
-- and the block a user has been watching for a month does not move because
-- they added another.
create table if not exists public.pinned_exercises (
  user_id     uuid not null references auth.users(id) on delete cascade,
  exercise_id text not null references public.exercises(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

-- The composite primary key is the "pinned twice" constraint, so the toggle on
-- the exercise screen needs no read before its write.
create index if not exists pinned_exercises_user
  on public.pinned_exercises (user_id, created_at);

alter table public.pinned_exercises enable row level security;

-- Same shape as recipes_own and entries_own: every table in this app is
-- user-scoped and a pin is private to whoever made it.
create policy pinned_exercises_own on public.pinned_exercises for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Carry the existing pins over before the column goes. Nobody should have to
-- re-pin the lift they were already watching.
insert into public.pinned_exercises (user_id, exercise_id)
select user_id, pinned_exercise_id
from public.nutrition_settings
where pinned_exercise_id is not null
on conflict do nothing;

alter table public.nutrition_settings
  drop column if exists pinned_exercise_id;
