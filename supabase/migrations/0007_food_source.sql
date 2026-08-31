-- Where a food's numbers came from (S6), and the ownership fix that makes
-- correcting them possible (S7).
--
-- `verified` already said "transcribed from a label", which is one bit for a
-- question with four answers. With Open Food Facts, label OCR, the seed set and
-- hand entry all writing into one `foods` table, the app has to be able to say
-- which of them a row came from -- and, when two rows describe the same
-- product, which one to believe. Open decision 2 promoted that hierarchy from a
-- badge to the ranking key; this column is the key.

alter table public.foods
  add column if not exists source text not null default 'manual'
    check (source in ('seed', 'off', 'label', 'manual', 'recipe'));

-- Backfill. Every existing row is identifiable from what wrote it: the seed set
-- in 0002 is the only thing that inserts without a creator, and the three code
-- paths that write foods all mint prefixed ids (lib/off.ts, actions.saveLabelFood,
-- lib/recipe.ts). Prefixes are applied second so they win over the creator test.
update public.foods set source = 'seed'   where created_by is null;
update public.foods set source = 'off'    where id like 'off\_%';
update public.foods set source = 'label'  where id like 'label\_%';
update public.foods set source = 'recipe' where id like 'recipe\_%';

-- ------------------------------------------------------- barcode ownership
-- 0005 made `barcode` globally unique, which quietly made the catalog
-- single-writer: the first person to scan a product owns its row forever, and
-- because foods_update is scoped to created_by, nobody else can fix a wrong
-- number on it. Worse, if they could, one person's correction would silently
-- become everyone else's data.
--
-- Scoping uniqueness to the creator gives each person at most one row per
-- barcode and lets a correction fork a row of their own (S7). The shared
-- catalog survives: lookupBarcode still reads other people's rows, it just
-- ranks them below your own. Nulls repeat freely under a unique index, so
-- barcode-less foods are unaffected -- as is the seed set, whose creator is
-- null and which carries no barcodes either.
drop index if exists public.foods_barcode_key;

create unique index if not exists foods_barcode_owner_key
  on public.foods (created_by, barcode);

-- Barcode lookup no longer filters by creator, so it needs an index that does
-- not lead with one.
create index if not exists foods_barcode
  on public.foods (barcode) where barcode is not null;

-- ------------------------------------------------------------ corrections
-- Correcting a food you did not write (the seed set, or somebody else's scan)
-- cannot mutate it: foods_update is scoped to created_by, and 0001 settled that
-- the catalog is append-only to non-creators. So a correction FORKS -- a new
-- row, owned by you, carrying the same barcode, which the hierarchy then
-- prefers for you and nobody else.
--
-- Without this pointer the fork would simply be a second row with the same name
-- sitting in everyone's search results. With it, the original is hidden from
-- whoever forked it and left alone for everybody else. It is deliberately not a
-- redirect: intake_entries.food_id still points at the row a portion was logged
-- against, because past entries keep the macros they were logged with (S7/S19).
alter table public.foods
  add column if not exists supersedes text references public.foods(id) on delete set null;

create index if not exists foods_supersedes
  on public.foods (supersedes) where supersedes is not null;
