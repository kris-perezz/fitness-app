-- Every user gets a settings row at sign-up, so the app never has to cope with
-- a missing one and a phase change is an edit rather than an insert.

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.nutrition_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before this migration.
insert into public.nutrition_settings (user_id)
select id from auth.users
on conflict (user_id) do nothing;
