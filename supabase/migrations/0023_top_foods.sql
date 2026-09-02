-- What is actually costing me (S85).
--
-- A function rather than a view, because the grouping has to happen AFTER the
-- window is applied. A view grouped by food would have to group by day as well
-- to stay filterable, which is `intake_days` again and answers a different
-- question; grouped without a date it would sum all of history, and "my top
-- foods ever" is not a thing anybody acts on.
--
-- And a function rather than fetching a month of entries to group in the
-- browser: the aggregate is the database's job, and a client-side version would
-- be a second implementation of a sum that Postgres already does correctly on
-- rows it is holding anyway.
--
-- `security invoker` so RLS on intake_entries applies as the caller. The
-- explicit auth.uid() filter is belt and braces -- it costs nothing, and it
-- means the function is still correct if the policy is ever loosened.
create or replace function public.top_foods(
  from_date date,
  to_date date,
  row_limit int default 10
)
returns table (
  key text,
  name text,
  kcal numeric,
  entries bigint,
  kcal_per_entry numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    -- GROUPED BY FOOD, and a one-off typed straight into the log has no food
    -- row to group by. Falling back to the name keeps two different one-offs
    -- apart; grouping every null together would merge them into a single row
    -- named after whichever one sorted first.
    coalesce(e.food_id, 'name:' || lower(e.name)) as key,
    -- The DENORMALISED name, not a join to `foods`. The catalog row may have
    -- been superseded or deleted since (S7/S19), and the entry records what the
    -- food was called when it was logged, which is what the user will recognise.
    min(e.name) as name,
    sum(e.kcal) as kcal,
    count(*) as entries,
    -- Calories per entry rather than an average PORTION. Portion is only
    -- meaningful within one unit, and a food logged sometimes as "1 serving"
    -- and sometimes as "150 g" would average into a number in neither.
    round(sum(e.kcal) / count(*), 0) as kcal_per_entry
  from public.intake_entries e
  where e.user_id = auth.uid()
    and e.log_date between from_date and to_date
  group by coalesce(e.food_id, 'name:' || lower(e.name))
  -- By SUM, which is the whole point: the useful surprise is a small food eaten
  -- constantly rather than a big one eaten once, and ranking by portion size
  -- hides exactly that.
  order by sum(e.kcal) desc
  limit row_limit
$$;

grant execute on function public.top_foods(date, date, int) to authenticated;
