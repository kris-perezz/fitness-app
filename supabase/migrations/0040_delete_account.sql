-- Foods and exercises keep their rows when their creator goes (created_by is
-- set null), which would turn private data into shared seed data. Delete them
-- first, after the rows that reference them.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not signed in';
  end if;

  delete from public.recipes where user_id = uid;
  delete from public.workouts where user_id = uid;
  delete from public.intake_entries where user_id = uid;
  delete from public.foods where created_by = uid;
  delete from public.exercises where created_by = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
