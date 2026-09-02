-- Micronutrients on what was actually eaten (S38).
--
-- DENORMALISED ONTO THE ENTRY, exactly as kcal and the macros already are, and
-- for the same reason (S7/S19): an entry keeps what it was logged with. A day's
-- micros must never be computed by joining back to `foods`, because correcting a
-- food would then retroactively rewrite last month's totals -- the single rule
-- this schema has been built around since 0001.
--
-- `micros` mirrors the column on `foods`, down to the jsonb and the `{}`
-- default. `sugar_g` is nullable rather than `default 0` on purpose: the macros
-- beside it are all `not null default 0` because an unlogged macro is genuinely
-- zero grams, but a food whose sugar nobody recorded has UNKNOWN sugar, and a
-- zero would be a claim the entry cannot support.
alter table public.intake_entries
  add column if not exists micros jsonb not null default '{}'::jsonb,
  add column if not exists sugar_g numeric;

-- ------------------------------------------------------------ intake_days
-- The day view has to sum the jsonb, which is the one piece of real query work
-- in this story: `sum(kcal)` is free and this is not.
--
-- The shape below sums each key across the day's entries and rebuilds one
-- object. `jsonb_each_text` unrolls every entry's micros into key/value rows,
-- which are then grouped -- so a key nobody recorded never appears, and ABSENT
-- STAYS ABSENT through the aggregate rather than arriving as a zero.
--
-- Recreated rather than altered: a view's column list cannot be added to in
-- place, and 0001 established that this view is the only definition of a day.
drop view if exists public.intake_days;

create view public.intake_days
with (security_invoker = true) as
select
  e.user_id,
  e.log_date,
  sum(e.kcal)      as kcal,
  sum(e.protein_g) as protein_g,
  sum(e.fat_g)     as fat_g,
  sum(e.carb_g)    as carb_g,
  sum(e.fiber_g)   as fiber_g,
  sum(e.sodium_mg) as sodium_mg,
  -- Null when no entry recorded any, which is different from a day of zero
  -- sugar. `sum` already behaves this way for the numeric columns; this keeps
  -- the jsonb consistent with them.
  sum(e.sugar_g)   as sugar_g,
  count(*) filter (where e.estimate) as estimate_count,
  count(*) as item_count,
  coalesce(
    (
      select jsonb_object_agg(m.key, m.total)
      from (
        select kv.key, sum(kv.value::numeric) as total
        from public.intake_entries i
        cross join lateral jsonb_each_text(i.micros) as kv(key, value)
        where i.user_id = e.user_id and i.log_date = e.log_date
        group by kv.key
      ) as m
    ),
    '{}'::jsonb
  ) as micros
from public.intake_entries e
group by e.user_id, e.log_date;
