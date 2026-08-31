-- What `grams_per_unit` is measured in (S40).
--
-- The column has always held "whatever the product is declared in" -- grams for
-- a slice of bread, millilitres for a cup of milk (learning 8). For a per_100g
-- food that is recoverable, because `unit` doubles as the measure and reads 'g'
-- or 'ml'. For a per_unit food `unit` is the COUNTING noun -- cup, slice,
-- scoop, wiener -- and nothing recorded which of the two the number was.
--
-- The consequence was that milk could only be logged in whole cups. The
-- by-amount toggle built for S5 is gated on basis = 'per_100g' purely because
-- that is the half of the catalog where the measure was knowable; with this
-- column the gate can ask the question it actually means, which is "does this
-- food know what one of it weighs".
--
-- It cannot be inferred from the noun, which is why this is a column and not a
-- lookup table: the seed set carries cup, bottle and venti (volume) beside
-- tbsp, can, scoop and medium, all of which store GRAMS despite tbsp and can
-- being volume words in English. A tablespoon of olive oil is stored as 14, and
-- 14 is grams.

alter table public.foods
  add column if not exists weight_unit text not null default 'g'
    check (weight_unit in ('g', 'ml'));

-- per_100g foods already answer this in `unit`, so mirror it rather than
-- inventing a second source of truth. From here on the two must agree for that
-- basis, which the application upholds on write.
update public.foods
   set weight_unit = unit
 where basis = 'per_100g' and unit in ('g', 'ml');

-- per_unit foods, classified by inspection of the seed set rather than by rule.
-- Milks and juice are declared per 250 mL, the shakes per bottle in mL, and the
-- Starbucks venti is 709 mL. Everything else -- including every tbsp and can --
-- is a weight on its label.
update public.foods
   set weight_unit = 'ml'
 where basis = 'per_unit'
   and unit in ('cup', 'bottle', 'venti');
