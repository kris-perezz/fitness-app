-- Barcode scanning (S1-S3). A scanned code resolves against the local catalog
-- before any network call, and a confirmed remote lookup is written back here
-- so the second scan of the same product needs no network at all.

alter table public.foods
  add column if not exists barcode text;

-- Nullable on purpose: whole foods, homemade dishes and recipe outputs have no
-- barcode. Postgres lets nulls repeat under a unique index, so one index covers
-- both "at most one row per barcode" and "most rows have none".
create unique index if not exists foods_barcode_key
  on public.foods (barcode);
