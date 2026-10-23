-- Daily cap on paid AI calls, shared by /api/estimate and /api/label.
--
-- The counter is only reachable through take_ai_call(): RLS is on with no
-- policies, so a client cannot reset its own row.
create table if not exists public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security;

-- Counts the call and says whether it is allowed. security definer because the
-- table has no policies; auth.uid() keeps it to the caller's own row.
create or replace function public.take_ai_call()
returns boolean
language sql
security definer
set search_path = ''
as $$
  insert into public.ai_usage as u (user_id, day, calls)
  values (auth.uid(), (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set calls = u.calls + 1
  returning u.calls <= 30
$$;

revoke execute on function public.take_ai_call() from public, anon;
grant execute on function public.take_ai_call() to authenticated;
