-- Errors from the server and the browser, written by the app and read from the
-- SQL editor. Signed-out pages report too, so inserts are open to anon with
-- column length caps to limit abuse; nothing is readable through the API.
create table if not exists public.error_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid default auth.uid() references auth.users on delete set null,
  source text check (char_length(source) <= 100),
  message text check (char_length(message) <= 2000),
  detail text check (char_length(detail) <= 8000),
  path text check (char_length(path) <= 500)
);

alter table public.error_log enable row level security;

drop policy if exists "error_log insert" on public.error_log;
create policy "error_log insert" on public.error_log
  for insert to anon, authenticated
  with check (true);

grant insert on public.error_log to anon, authenticated;
