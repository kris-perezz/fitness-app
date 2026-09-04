-- Reference rows go back to being shared.
--
-- 0028 narrowed `foods_read` to "nobody owns it, or you own it", which is right
-- about the half of the catalog it was aimed at -- a label you photographed, a
-- recipe you built, a correction carrying your name for a thing -- and wrong
-- about the half it caught by accident.
--
-- WHAT IT CAUGHT. A Health Canada food is `cnf_<code>` and an Open Food Facts
-- product is `off_<barcode>`, and both ids are derived from the source rather
-- than generated. Two people picking the same food therefore address the same
-- primary key. That was deliberate and it worked: the second person found the
-- row the first had already materialised and paid no round trip for it.
--
-- Once the row is invisible to them, the pre-check misses, the insert collides
-- on the primary key, and `addCnfFood` and `saveScannedFood` both swallow 23505
-- as "somebody else got there first" -- which was true when they could still
-- read the winner. Now it is a lost write reported as a success: no row in
-- their catalog, no search hit, and a call to Health Canada every single time
-- they reach for the same food.
--
-- It also stranded 0007. `foods_barcode_owner_key` is `(created_by, barcode)`
-- precisely so several people can hold a row for one product, and
-- `bestBarcodeMatch` ranks them with your own on top. Under 0028 that query
-- can only ever return one row, so the ranking has nothing to rank.
--
-- WHY SOURCE IS THE RIGHT TEST. `source` already answers "how good are these
-- numbers", and the two values added here are exactly the two that mean "copied
-- from a public database, unedited". They are not information about a person:
-- the row holds a name and its macros, and who ate it lives in
-- `intake_entries`, which is filtered by user either way. The moment anybody
-- corrects one, `updateFood` forks a private row and collapses the source to
-- `manual` (0028) -- so a corrected row leaves the shared set on the same edit
-- that makes it personal, with no second rule needed to chase it.
--
-- `label` and `recipe` are deliberately absent. A transcribed panel is a
-- photograph of one package in one kitchen, and a recipe is somebody's cooking;
-- neither is reference data, and 0028 is right to keep them in.
drop policy if exists foods_read on public.foods;

create policy foods_read on public.foods for select to authenticated
  using (
    created_by is null
    or created_by = auth.uid()
    or source in ('cnf', 'off')
  );
