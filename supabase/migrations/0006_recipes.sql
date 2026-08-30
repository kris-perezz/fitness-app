-- Recipes (S15-S17, S19, S21). A recipe is a saved *definition* -- a named list
-- of ingredients plus how many servings the pot made -- not a log entry. It is
-- editable indefinitely, and editing it never touches history: intake_entries
-- denormalises macros at log time, so a past portion keeps what it was logged
-- with. Regenerating the foods row below is forward-looking only (S19).

-- ------------------------------------------------------------- recipes
create table if not exists public.recipes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  name            text not null,
  -- Servings is the primary model and is macro-exact: water lost in cooking
  -- carries no calories, so 1/6 of the pot is 1/6 of the macros (S16). Zero
  -- servings would make per-serving macros undefined, hence the check.
  servings        numeric not null check (servings > 0),
  -- Optional (S17). Present, it gives grams_per_unit on the generated food and
  -- lets an odd-sized portion be logged by grams; absent, servings still work.
  -- The field is a convenience, never a gate on saving.
  cooked_weight_g numeric check (cooked_weight_g > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists recipes_user on public.recipes (user_id, created_at desc);

-- --------------------------------------------------- recipe ingredients
-- qty follows the SAME convention as intake_entries.qty and lib/food.ts
-- `scale()`: a COUNT for per_unit foods, GRAMS for per_100g foods. Storing the
-- food's own quantity keeps "2 eggs" readable as "2 eggs" (open decision 3);
-- grams are derived at read time from foods.grams_per_unit, which is nullable,
-- so a per_unit food without one has an UNKNOWN weight rather than a zero one.
create table if not exists public.recipe_ingredients (
  id         uuid primary key default gen_random_uuid(),
  recipe_id  uuid not null references public.recipes(id) on delete cascade,
  food_id    text not null references public.foods(id),
  qty        numeric not null,
  -- Ingredients read as a list in the order they were entered; without an
  -- explicit column, row order out of Postgres is not guaranteed.
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists recipe_ingredients_recipe
  on public.recipe_ingredients (recipe_id, sort_order);

-- ----------------------------------------------------------------- RLS
alter table public.recipes            enable row level security;
alter table public.recipe_ingredients enable row level security;

-- Same shape as entries_own / settings_own in 0001_init.sql: every table in
-- this app is user-scoped, and a recipe is private to whoever wrote it.
create policy recipes_own on public.recipes for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Ingredients carry no user_id of their own -- ownership is the parent
-- recipe's, so the policy asks the parent rather than duplicating the column.
create policy recipe_ingredients_own on public.recipe_ingredients for all to authenticated
  using (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes r
      where r.id = recipe_ingredients.recipe_id and r.user_id = auth.uid()
    )
  );
