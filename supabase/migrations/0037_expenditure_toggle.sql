-- Adaptive expenditure is experimental and only offered inside strict mode, so
-- it starts off for every account and is turned on from the Profile screen.
alter table public.nutrition_settings
  add column if not exists expenditure_enabled boolean not null default false;
