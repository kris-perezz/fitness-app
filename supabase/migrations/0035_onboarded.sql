-- Whether this account has chosen its own targets yet. The row is created on
-- sign-up with column defaults, and until then those defaults are nobody's
-- decision: the Food tab asks for targets instead, and no day is graded
-- against numbers the user never set.
alter table public.nutrition_settings
  add column if not exists onboarded boolean not null default true;

-- Existing accounts keep `true` from the default above; new ones start false.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nutrition_settings (user_id, onboarded)
  values (new.id, false)
  on conflict (user_id) do nothing;
  return new;
end;
$$;
