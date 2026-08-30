-- Move to the conventions every mainstream tracker uses:
--   goals = calories + protein/carbs/fat, no phase vocabulary
--   entries belong to a meal

alter table public.nutrition_settings
  drop column if exists phase_label,
  drop column if exists protein_stretch_g;

alter table public.nutrition_settings
  rename column cal_daily_equiv to calorie_goal;

alter table public.nutrition_settings
  rename column protein_floor_g to protein_goal_g;

alter table public.nutrition_settings
  rename column fat_floor_g to fat_goal_g;

alter table public.nutrition_settings
  add column if not exists carb_goal_g numeric not null default 200;

alter table public.nutrition_settings
  alter column calorie_goal set default 2000,
  alter column protein_goal_g set default 150,
  alter column fat_goal_g set default 65;

alter table public.intake_entries
  add column if not exists meal text not null default 'Snacks'
    check (meal in ('Breakfast', 'Lunch', 'Dinner', 'Snacks'));

create index if not exists intake_entries_user_date_meal
  on public.intake_entries (user_id, log_date, meal);
