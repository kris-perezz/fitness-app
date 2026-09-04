/**
 * Build the calibration fixture set from the local Canadian Nutrient File.
 *
 * RUN THIS RARELY. Its output, fixtures.json, is checked in with real numbers
 * in it -- the same convention as src/lib/cnf.test.mts, and for the same
 * reason: a test whose ground truth is fetched at run time is measuring the
 * fetch as much as the thing under test.
 *
 * IT NEEDS THE LOCAL CNF EXTRACT, which is NOT in git. tools/ is listed in
 * .git/info/exclude, so tools/philippine-catalog/cnf/base/ exists only on a
 * machine that has run the Philippine catalog build. That is fine and
 * deliberate: the 59 MB Health Canada bulk download does not belong in the
 * repo, and nothing at eval time reads it. If this script cannot find the
 * CSVs it says so and stops, rather than emitting a fixture set with invented
 * numbers in it.
 *
 * WHY CNF AND NOT AN AGGREGATOR. Every reference here is a lab value from
 * Health Canada under the Open Government Licence. Nutrition aggregators
 * disagree with each other by more than the model error being measured -- a
 * Canadian Big Mac came back as 520, 550 and 560 kcal from three of them in a
 * single search -- so a reference sourced that way cannot support a claim
 * about a 15% bias.
 *
 * WHAT THIS SET DELIBERATELY DOES NOT COVER. Restaurant plates and mixed
 * dishes, which is where the real error lives. There is no free weighed
 * ground truth for a plate of pulled pork poutine, and inventing one would
 * make the whole exercise circular. The chain and packaged strata are left as
 * empty arrays in the output with their schema documented, to be filled in by
 * hand from each chain's own nutrition page and from panels on boxes you own.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CNF = join(HERE, "..", "..", "tools", "philippine-catalog", "cnf", "base");

/** The six the form holds. CNF ships hundreds; these are the ones scored. */
const NUTRIENTS = {
  kcal: 208,
  protein_g: 203,
  fat_g: 204,
  carb_g: 205,
  fiber_g: 291,
  sodium_mg: 307,
};

/**
 * The CSVs are Latin-1, not UTF-8 -- the French description column is full of
 * accented characters that arrive as replacement characters otherwise, and a
 * mangled description would silently break the exact-match resolver below.
 */
function parseCsv(file) {
  const path = join(CNF, file);
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    console.error("This script needs the local CNF extract, which is not in git.");
    console.error("Run the Philippine catalog build first, or unzip");
    console.error("tools/philippine-catalog/cnf/cnf-fcen-csv.zip into cnf/base/.");
    process.exit(1);
  }
  const text = readFileSync(path, "latin1");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows.shift();
  return rows
    .filter((r) => r.length === head.length)
    .map((r) => Object.fromEntries(head.map((h, j) => [h, r[j]])));
}

/**
 * THE DESCRIPTION IS WHAT A PERSON WOULD ACTUALLY TYPE, and it always states
 * an amount.
 *
 * describe.ts calls "the whole portion described" the most important line in
 * its prompt, so a fixture that says only "chicken breast" would be testing
 * the too_vague path by accident. Every row here names a weight or a count
 * that resolves to one, because the reference is computed from that weight.
 *
 * `cnf` is matched against FoodDescription EXACTLY. A near-miss is a hard
 * failure rather than a fuzzy match to something adjacent -- resolving "ukoy"
 * to plain shrimp is precisely the failure mode the intake import refused to
 * accept, and it is worse here, where the wrong row becomes ground truth.
 */
const SINGLES = [
  { id: "chicken-200g", cnf: "Chicken, broiler, meat only, roasted", g: 200, text: "200 g of roasted chicken, meat only, no skin" },
  { id: "turkey-150g", cnf: "Turkey, broiler, breast, meat only, roasted", g: 150, text: "150 g of roasted turkey breast" },
  { id: "beef-150g", cnf: "Beef, ground, lean, broiled", g: 150, text: "150 g of cooked lean ground beef" },
  { id: "salmon-170g", cnf: "Fish, salmon, atlantic, farmed, baked or broiled", g: 170, text: "170 g of baked atlantic salmon" },
  { id: "tuna-165g", cnf: "Fish, tuna, light, canned in water, drained, salted", g: 165, text: "a drained can of light tuna in water, about 165 g" },
  { id: "rice-250g", cnf: "Grains, rice, white, long-grain, regular, cooked", g: 250, text: "250 g of cooked white rice" },
  { id: "oats-234g", cnf: "Cereal, hot, oats, quick, prepared, Quaker", g: 234, text: "a bowl of cooked quick oats, about 234 g" },
  { id: "bread-52g", cnf: "Bread, white, commercial", g: 52, text: "two slices of white bread, about 52 g" },
  { id: "blackbeans-172g", cnf: "Beans, black, mature seeds, boiled", g: 172, text: "a cup of boiled black beans, about 172 g" },
  { id: "milk-250ml", cnf: "Milk, fluid, partly skimmed, 2% M.F.", g: 258, text: "250 ml of 2% milk" },
  { id: "cheddar-40g", cnf: "Cheese, cheddar", g: 40, text: "40 g of cheddar cheese" },
  { id: "yogurt-175g", cnf: "Yogourt, plain, fat free (0-0.5% MF)", g: 175, text: "175 g of plain fat free yogurt" },
  { id: "peanutbutter-32g", cnf: "Peanut butter, smooth type, fat, sugar and salt added", g: 32, text: "2 tablespoons of smooth peanut butter, about 32 g" },
  { id: "almonds-30g", cnf: "Nuts, almonds, dry roasted, unblanched", g: 30, text: "30 g of dry roasted almonds" },
  { id: "oliveoil-14g", cnf: "Vegetable oil, olive", g: 14, text: "1 tablespoon of olive oil" },
  { id: "avocado-100g", cnf: "Avocado, raw, all commercial varieties", g: 100, text: "half an avocado, about 100 g" },
  { id: "apple-182g", cnf: "Apple, raw, with skin", g: 182, text: "a medium apple with the skin on, about 182 g" },
  { id: "banana-118g", cnf: "Banana, raw", g: 118, text: "a medium banana, about 118 g" },
];

/**
 * Scored separately and never pooled into the error metrics, because these
 * have a right answer rather than a close-enough one.
 *
 * `expect` is what the harness asserts: "vague" means describe.ts must refuse,
 * and a `ratio` case means the answer must be that multiple of a named
 * fixture's reference. The multi-portion case is the one worth having -- it
 * guards the single line describe.ts calls load-bearing, and a regression
 * there is invisible in an average because every number stays plausible.
 */
const RULES = [
  { id: "vague-chicken", text: "chicken", expect: "vague" },
  { id: "vague-lunch", text: "lunch", expect: "vague" },
  { id: "vague-snack", text: "a snack", expect: "vague" },
  { id: "portion-3x-rice", text: "3 bowls of cooked white rice, about 250 g each", expect: "ratio", of: "rice-250g", times: 3 },
  { id: "portion-stated-weight", text: "240 g of roasted chicken, meat only, no skin", expect: "ratio", of: "chicken-200g", times: 1.2 },
];

function build() {
  const foods = parseCsv("FOOD NAME.csv");
  const amounts = parseCsv("NUTRIENT AMOUNT.csv");

  const byDescription = new Map();
  for (const f of foods) byDescription.set((f.FoodDescription || "").trim(), f.FoodID);

  // FoodID -> NutrientID -> value per 100 g edible portion.
  const per100 = new Map();
  const wanted = new Set(Object.values(NUTRIENTS).map(String));
  for (const a of amounts) {
    if (!wanted.has(a.NutrientID)) continue;
    let row = per100.get(a.FoodID);
    if (!row) per100.set(a.FoodID, (row = {}));
    row[a.NutrientID] = Number(a.NutrientValue);
  }

  const missing = [];
  const singles = [];
  for (const s of SINGLES) {
    const id = byDescription.get(s.cnf);
    if (id === undefined) {
      missing.push(s.cnf);
      continue;
    }
    const row = per100.get(id);
    if (!row) {
      missing.push(`${s.cnf} (no nutrient rows)`);
      continue;
    }
    const reference = {};
    for (const [field, nutrientId] of Object.entries(NUTRIENTS)) {
      const v = row[nutrientId];
      // Absent stays absent. A zero here would be a claim the row cannot
      // support, and it would drag the measured bias toward zero for free.
      reference[field] = v === undefined ? null : round(v * (s.g / 100), 2);
    }
    singles.push({
      id: s.id,
      stratum: "cnf_single",
      text: s.text,
      grams: s.g,
      reference,
      source: "Canadian Nutrient File 2015",
      source_ref: `FoodID ${id} — ${s.cnf}`,
      // CNF values are lab-measured composition per 100 g. The reference error
      // is the analytical error plus whatever the stated weight is off by, and
      // for a stated weight that is zero. This is the tightest reference in
      // the whole set, which is exactly why the stratum exists.
      reference_uncertainty: "±5% (lab composition, weight stated in the description)",
    });
  }

  if (missing.length > 0) {
    console.error("These CNF descriptions did not resolve exactly:");
    for (const m of missing) console.error(`  ${m}`);
    console.error("Fix the strings in SINGLES rather than loosening the match.");
    process.exit(1);
  }

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    attribution:
      "Contains information licensed under the Open Government Licence – Canada. " +
      "Health Canada, Canadian Nutrient File 2015.",
    note:
      "cnf_single and rules are generated by build-fixtures.mjs. chain and packaged " +
      "are hand-entered: read each number off the chain's own Canadian nutrition page " +
      "or off a panel on a box you own, and record the URL and the date you read it. " +
      "Do not fill them from a nutrition aggregator.",
    strata: {
      cnf_single: singles,
      rules: RULES,
      /** Shape for the hand-entered rows, kept here so the schema is obvious. */
      chain: [],
      packaged: [],
    },
  };

  const path = join(HERE, "fixtures.json");
  writeFileSync(path, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote ${singles.length} CNF fixtures and ${RULES.length} rule cases to ${path}`);
}

function round(n, places) {
  const f = 10 ** places;
  return Math.round((n + Number.EPSILON) * f) / f;
}


build();
