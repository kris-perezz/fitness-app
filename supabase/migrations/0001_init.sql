-- Fitness app: initial schema.
-- Scope: food logging only. Lifting, steps and analysis come later.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- foods
-- Shared catalog. Rows are append-only to non-creators: editing a shared
-- food's macros would retroactively corrupt someone else's logged history.
-- Corrections create a new row, they never mutate an existing one.
create table public.foods (
  id            text primary key,
  name          text not null,
  aliases       text[] not null default '{}',
  basis         text not null check (basis in ('per_unit','per_100g')),
  unit          text not null,
  grams_per_unit numeric,
  kcal          numeric not null,
  protein_g     numeric not null default 0,
  fat_g         numeric not null default 0,
  carb_g        numeric not null default 0,
  fiber_g       numeric not null default 0,
  sugar_g       numeric,
  sodium_mg     numeric,
  micros        jsonb not null default '{}'::jsonb,
  verified      boolean not null default false, -- true = transcribed from a label
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index foods_name_trgm on public.foods using gin (to_tsvector('simple', name));

-- ------------------------------------------------------- intake entries
-- One row per item eaten. Day totals are a view, never stored -- that is
-- what made the old merge path fragile.
create table public.intake_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  log_date    date not null,
  food_id     text references public.foods(id),
  name        text not null,          -- denormalised: label at time of logging
  qty         numeric not null,
  unit        text not null,
  estimate    boolean not null default false,
  kcal        numeric not null,
  protein_g   numeric not null default 0,
  fat_g       numeric not null default 0,
  carb_g      numeric not null default 0,
  fiber_g     numeric not null default 0,
  sodium_mg   numeric not null default 0,
  created_at  timestamptz not null default now()
);

create index intake_entries_user_date on public.intake_entries (user_id, log_date desc);

-- --------------------------------------------------- nutrition settings
-- The app's phase.json. Prescribed values only -- never a measured one.
create table public.nutrition_settings (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  phase_label       text,
  cal_daily_equiv   numeric not null default 2000,
  protein_floor_g   numeric not null default 155,
  protein_stretch_g numeric,
  fat_floor_g       numeric not null default 55,
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------ day view
create view public.intake_days
with (security_invoker = true) as
select
  user_id,
  log_date,
  sum(kcal)      as kcal,
  sum(protein_g) as protein_g,
  sum(fat_g)     as fat_g,
  sum(carb_g)    as carb_g,
  sum(fiber_g)   as fiber_g,
  sum(sodium_mg) as sodium_mg,
  count(*) filter (where estimate) as estimate_count,
  count(*) as item_count
from public.intake_entries
group by user_id, log_date;

-- ----------------------------------------------------------------- RLS
alter table public.foods              enable row level security;
alter table public.intake_entries     enable row level security;
alter table public.nutrition_settings enable row level security;

-- Catalog is readable by every signed-in user; rows can only be edited by
-- whoever created them.
create policy foods_read   on public.foods for select to authenticated using (true);
create policy foods_insert on public.foods for insert to authenticated with check (auth.uid() = created_by);
create policy foods_update on public.foods for update to authenticated using (auth.uid() = created_by);

create policy entries_own on public.intake_entries for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy settings_own on public.nutrition_settings for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
