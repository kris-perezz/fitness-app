# Filipino catalog — open issues and known failure points

State as of 2026-09-01. **The migration `0020_seed_filipino_foods.sql` has NOT been applied
and should not be applied as it stands.** Two independent blind audits have run against this
pipeline; both returned "do not apply". Most of what they found is fixed, and what is listed
here is what is not.

Read this before touching anything. The recurring lesson is that **every defect in this
pipeline produces a plausible number** — no crash, no warning, no red test. Chicken liver in
a pork dish and a 1,200 g bouillon cube both looked exactly like data.

---

## How to pick this up

```
cd tools/philippine-catalog
python harvest.py urls      # sitemaps -> urls.txt        (already committed)
python harvest.py fetch     # ~4,000 pages, 1.5s apart, cached; ~100 min from cold
python harvest.py extract   # cached pages -> corpus.jsonl (already committed)
python parse.py             # corpus -> parsed.jsonl
python phase2.py            # dish list scored -> dishes.json
python compute.py           # -> dishes.computed.json
python seed.py              # -> ../../supabase/migrations/0020_seed_filipino_foods.sql
```

`cnf/` is not committed — it is ~100 MB of Canadian Nutrient File CSVs under the Open
Government Licence. Download `cnf-fcen-csv.zip` from the Health Canada page linked in
`cnf.py` and extract it to `cnf/base/`. Do NOT apply the separate update pack; `cnf.py`
explains why in detail (the base download already contains it).

`cache/` is not committed either (3,983 HTML pages). `corpus.jsonl` is, so the pipeline runs
without re-crawling.

---

## Blockers — these must be fixed before the migration is applied

### 1. Bone-in cuts are priced as boneless
`cnf.load_refuse()` discounts the inedible portion, but only when the **mapped CNF food** has
a refuse row. Every Filipino bone-in cut is mapped to a boneless composite with refuse 0.00:

| ingredient | maps to | refuse |
|---|---|---|
| `beef shank`, `oxtail`, `beef neck bone`, `cow trotters` | 6285 stewing beef, 0 mm trim | 0.00 |
| `pata`, `pork hock` | 6206 pork hocks, **pickled** | 0.00 |
| bone-in chicken breast | 841 skinless boneless breast | 0.00 |

Bulalo therefore reads **87.5 g protein a serving** — roughly 1.1 kg of as-purchased bone-in
shank priced as boneless lean beef, about 2x too high. 6206 is also a **cured** product
(1,050 mg Na/100 g against ~60 for fresh), which inflates sodium wherever pata appears.

Fix: hand refuse fractions per mapped ingredient, not per CNF food.

### 2. Refuse is double-discounted on the count and volume paths
`compute.py` applies refuse unconditionally, but the count path already returns edible grams
— `count_table.py` says "1 whole chicken ~1.2 kg **edible portion**" and then 32% more comes
off. USDA's 118 g banana is peeled and loses 36% again; the 50 g egg is shelled and loses
12%. Measured at **45.7 kg across all seeded dishes, 3.2% of all resolved grams**,
concentrated in banana desserts and tortang talong.

Fix: apply refuse on the `mass` path only.

### 3. The coverage metrics do not measure coverage
- `gram_coverage` is hardcoded to `1.0` and compared against `MIN_GRAM_COVERAGE = 1.0`. It is
  a gate that cannot fail, and `seed.py` prints "gram 100%" as though it were measured.
- `cnf_coverage = priced / (typical_total * (1 - drained))`, but `composition` is built only
  from mapped foods, so `priced ~= sum(composition)`. The ratio reduces to
  `accounted_share / (1 - drained)` — it measures **how much water was drained**, not how much
  CNF could price. `Adobong Pusit` scored 104%; a fraction above 1 proves it is not a
  fraction of anything.
- There is a `<= 1.05` upper guard on `accounted_share` and **no lower guard at all**, so
  dishes pass with 60%+ of their raw weight missing.

Fix: measure the real unmapped share against the same denominator, rename to what it
measures, and add a lower bound.

---

## Should-fix

### 4. Single-recipe dishes ship unflagged
`Kaldereta (goat)`, `Betamax` and `Tinolang Isda` are each a prevalence-weighted median of
**one** recipe; `Bagnet`, `Crispy Pata`, `Mami`, `Pinakbet`, `Ginataang Hipon`, `Maruya` and
`Camote Cue` rest on two. `seedable` has no `recipes >= N` term, and nothing on the row says
so — indistinguishable in the catalog from adobo's 60. The plan promised tier-2 rows would be
"flagged on the row as single-sourced"; no column carries it and `seed.py` emits nothing.

### 5. Frying-oil retention is applied to rendered meats
Lechon kawali, bagnet and crispy pata are boiled then deep-fried: they **render fat out**,
they do not absorb 10% of their weight in oil. Notes show 92 g retained in lechon kawali,
about 17 g a serving, on top of 36% raw pork belly.

### 6. Canned tomato products are priced as one fresh tomato
`(r"tomato|kamatis", None, 100.0)` in `count_table.py` matches `"8 oz. can tomato sauce"` and
`"6 oz. can tomato paste"` — 227 g and 170 g both become 100 g. `parse.py`'s bracketed-size
fix handles `1 (14 oz) can` but not `1 8 oz. can`; **179 corpus lines** carry a stranded
mass in the parsed name.

### 7. Wrong mappings still in `mapping.tsv`
- `long green pepper` (siling haba) resolves via `map.resolve`'s word-dropping to
  `pepper -> 198 Spices, pepper, black` — the wrong food. The **gram table** was fixed to 12 g;
  the **mapping** was not. 67 lines.
- `mayonnaise -> 422 Vegetable oil, olive`, 27 lines. 884 kcal/100 g against mayo's ~680, and
  the sodium and egg vanish. Worse, 422 is in `FRYING_OILS`, so 90% of it is then "discounted
  as not absorbed".
- `corned beef -> beef brisket, lean` drops ~900 mg/100 g of cure sodium.
- `salted butter -> Butter, unsalted`; `panko bread crumbs -> wheat flour`;
  `quail eggs -> chicken egg` (weight right via the 9 g rule, nutrients wrong).
- `chicharon -> 1814 roasted shoulder` is the worst substitute in the file. Chicharon is
  rendered skin: very high protein and fat, almost no water.

### 8. Water is dropped by section string, and the sections are wrong
`compute.py`'s `SOUPY = ("Soups",)` decides whether cooking liquid is eaten. But
**Champorado, Sotanghon, Lomi and Mami are filed under "Rice and noodles"** in the plan doc
and are soups — their broth is eaten. Their serving weights are 2-4x too small while Sinigang
and Bulalo keep theirs. "One serving" means two different things across the same 53 rows.

Fix: decide per dish, not per section.

### 9. `hand_foods.py` bagoong does not reconcile
467 kcal against Atwater 4/4/9 = 406 kcal, 15% off. Every value is a whole-gram label reading
per 15 g scaled by 6.67, so each carries +/-3.3 g/100 g. 33 g fat is high even for the
sautéed jar. The sourcing is honest and cited; the precision is not real.

### 10. `parse.py` name junk
`"1 thumb-size ginger"` -> `"size ginger"` (59 lines). `"hard-boiled eggs"` -> `"hard eggs"`
(46 lines). Both currently resolve by luck through the word-dropping fallback.

### 11. Duplicate recipes double-weight the median
37 duplicate ingredient lists across 3,100 corpus recipes (1.2%) — e.g. *Sinigang na Panga ng
Tuna* appears twice among Sinigang's survivors.

---

## Structural, and worth deciding before more work

### The 111-dish target was invented, and 53 survive it
S34 names four dishes: sinigang, adobo, longganisa, pandesal. The 111-dish list and the goal
of seeding it were this project's choice, not the story's. **Consider shipping ~15 dishes
verified one at a time against a person who eats them, rather than 53 that pass gates which
keep turning out to be blind.** Both audits found real defects in dishes that passed every
gate; a human reading the list as food found three more in ninety seconds.

### Coverage is 60 Luzon, 2 Visayas, 0 Mindanao
Not fixable by more scraping — the corpus has zero Moro dishes across ~4,000 posts, because
Filipino recipe blogging is a Tagalog-language, Luzon-centred activity. For an app serving
Filipino users this is a trust problem, not a data gap: a Cebuano or Maranao user searches
their food and finds nothing. If it ships this way, **the app should say so** rather than
letting the silence read as "we forgot you exist".

### The published-calorie gate is not a check
`seedable` permits `-0.5 <= delta <= +1.0` against the sites' own figures. A range spanning
2x to 1/2x rejects almost nothing, and the survivors are then reported as "agreeing". Shipped
anyway: Camote Cue +86%, Sinigang +77%, Mami +58%, Suman +53%, Adobo sa Gata +50%.

### `grams_per_unit` is null on every row, by design
This is S35 applied to a catalog row: the cooked weight of these dishes is not derivable from
a recipe, so the portion is informal (`bowl`, `slice`, `piece`, `serving`) and `canMeasure()`
correctly drops the grams input. Do not "fix" this by reinstating a gram weight — an earlier
draft shipped a raw pre-cooking mass and a 400 g bowl of champorado logged as 3.7 servings.

---

## Fixed, with the reasoning worth keeping

Each of these was found by looking at output, never by reading code.

1. **Median with absences as zeros deleted every protein.** Adobo's recipes split between
   pork, chicken and beef, so each fell under half and the median adobo was soy sauce and
   garlic: 111 kcal. Now prevalence-weighted.
2. **Re-normalising mapped ingredients to fill the dish** turned one recipe where only the
   oil mapped into 507 g of oil, 4,489 kcal.
3. **CNF mixes whole items and fragments**: onion carries "1 large" (150 g) and "1 medium
   slice" (14 g); matching naively understated an onion tenfold.
4. **"Adobo Fried Rice" scored as adobo**, putting 641 g of cooked rice in the median.
5. **Frying oil was being eaten** — banana cue at 1,905 kcal, twelve times its published
   figure.
6. **"Boneless" became an ingredient** — splitting "boneless, skinless chicken thighs" at the
   comma, 4 kg of it across the corpus, chicken silently gone.
7. **`pork shoulder` was mapped to belly** on a note claiming CNF had no shoulder row. CNF has
   ten. That false note authorised 27% of the catalog's calories and made roast pork read 18 g
   protein against 99 g fat.
8. **Two fish dishes contained no fish.** A whole milkfish produced no grams, the line was
   dropped, and a dropped line is absent from the denominator that should have failed it — 96%
   "coverage" on a dish missing its subject.
9. **A bouillon cube weighed 1,200 g**, because `\bchicken\b` sat above the cube rule in
   `count_table.py` — whose docstring says the specific goes before the general. Mami took
   129 g of dry bouillon powder a serving.
10. **Crispy pata contained chicken liver.** Every genuine recipe says "1 whole pig leg",
    produced no grams and was rejected; the only survivors were a *Crispy Pata Sisig* and a
    *Crispy Pata Dinakdakan* — dishes made FROM crispy pata. Sisig legitimately contains
    chicken liver. Fixed twice: pig leg has a weight now, and dish assignment is head-final
    ("Crispy Pata Sisig" is a sisig) rather than head-first.
11. **Dry and cooked were collapsed.** `parse.py` stripped "cooked" as a preparation note, so
    sinangag held 31% dry rice and 21% cooked rice at once: 1,596 kcal a serving.
12. **A cooked dish used as an ingredient was priced raw.** "1 lb leftover crispy pata meat"
    against raw belly (9.3 g protein/100 g) halves the protein of every sisig using it.

## The two rules this project keeps proving

- **A search that returns nothing is not evidence that nothing is there.** Re-shape the query.
  When a negative becomes load-bearing, prove it a second way. (See `learnings.md` #17.)
- **A safety check can be blind in exactly the direction it is watching.** Count what went in,
  not what came out, and make a dropped input fail loudly rather than shrink a divisor.
  (`learnings.md` #18.)
