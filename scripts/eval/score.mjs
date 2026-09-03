/**
 * Score a run's raw JSONL into the five numbers worth arguing about.
 *
 * SEPARATE FROM run.mjs SO RESCORING IS FREE. When the metric set turns out to
 * be wrong -- and the first one usually is -- this is re-run over the same
 * JSONL instead of re-paying for 69 API calls.
 *
 * ---------------------------------------------------------------- the metrics
 *
 * MEDIAN SIGNED % ERROR, NOT MAPE. describe.ts's own cache comment argues
 * (from S35) that a biased-but-stable estimator beats an unbiased-but-noisy
 * one, because a systematic logging error is absorbed into the TDEE the
 * adaptive model infers, and cancels out of the deficit that drives the
 * recommendation. That argument is right, and it has a consequence for
 * measurement: bias and spread are different quantities with different costs,
 * and a single MAPE fuses them into one number that hides both. So they are
 * reported separately, side by side, always.
 *
 * The cautionary result is real. An evaluation of ChatGPT on 114 meal
 * photographs found a median energy difference of +0.1% -- and agreement with
 * dietitians of only ICC 0.56. Near-zero bias, enormous spread. Any report
 * that led with the mean would have called that estimator excellent.
 *
 * SIGNED, and MEDIAN rather than mean, so one 3x outlier moves the headline by
 * nothing. Direction is the whole point: +30% and -30% have opposite fixes.
 *
 * THE STRATUM TABLE IS THE ACTUAL DELIVERABLE. S35's cancellation only works
 * if the bias is CONSTANT ACROSS FOOD TYPES. A model that runs +5% on packaged
 * food and +40% on deep-fried dishes does not have a bias, it has bias
 * correlated with diet composition -- which enters the filter as noise the
 * moment the diet shifts, and a diet shifts precisely when someone starts
 * dieting. A single global number cannot see this. The per-stratum table can.
 *
 * PROTEIN SEPARATELY, AND HELD TIGHTER. Nothing cancels a protein error: there
 * is no adaptive loop behind the protein target, the number goes straight to
 * the user as something to hit. It is also the field where models do worst
 * relative to humans.
 *
 * WHAT IS DELIBERATELY NOT HERE. Correlation, as a headline -- a model that
 * only separates big meals from small ones scores r ~ 0.75 while being 40% out
 * on everything. And per-item pass/fail: a stochastic model with golden values
 * per fixture is a permanently red test that people learn to ignore.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIELDS = ["kcal", "protein_g", "fat_g", "carb_g", "fiber_g", "sodium_mg"];

/**
 * The threshold the dietitian literature and NutriBench both use, and the one
 * number here a non-statistician can act on.
 */
const HIT_BAND = 0.25;

function median(xs) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs, q) {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Signed relative error as a percentage. Positive means the model was high. */
function pctError(got, reference) {
  if (reference === null || reference === 0) return null;
  return ((got - reference) / reference) * 100;
}

function fmt(n, places = 1) {
  return n === null || n === undefined ? "  n/a" : n.toFixed(places);
}

function load(path) {
  const rows = readFileSync(path, "utf8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l));
  const meta = rows.find((r) => r.type === "meta");
  return { meta, results: rows.filter((r) => r.type === "result") };
}

function score(path) {
  const { meta, results } = load(path);

  console.log(`\nRun     ${meta.started}`);
  console.log(`Model   ${meta.model}  effort=${meta.reasoning_effort}`);
  console.log(`Prompt  ${meta.prompt_hash}   repeats=${meta.repeats}`);
  console.log(
    "\nA run is only comparable to another with the same model, effort AND prompt hash.",
  );

  const scored = results.filter((r) => r.kind === "scored");
  const rules = results.filter((r) => r.kind === "rule");

  // ---------------------------------------------------------- answer rate
  // Reported before anything else, because every metric below is conditional
  // on it. Scoring only the answered subset rewards abstention: a model that
  // answers half the fixtures would beat one that answers all of them.
  const answered = scored.filter((r) => r.result.status === "ok");
  const rate = scored.length === 0 ? 0 : (answered.length / scored.length) * 100;
  console.log(`\nAnswer rate  ${fmt(rate)}%  (${answered.length}/${scored.length})`);
  const refused = scored.filter((r) => r.result.status !== "ok");
  if (refused.length > 0) {
    const by = new Map();
    for (const r of refused) by.set(r.id, (by.get(r.id) ?? 0) + 1);
    console.log(
      `  not answered: ${[...by].map(([id, n]) => `${id} x${n}`).join(", ")}`,
    );
  }

  // ------------------------------------------------------- headline numbers
  const errs = {};
  for (const f of FIELDS) errs[f] = [];
  const hits = [];
  for (const r of answered) {
    for (const f of FIELDS) {
      const e = pctError(r.result.estimate[f], r.reference?.[f] ?? null);
      if (e !== null) errs[f].push(e);
    }
    const k = pctError(r.result.estimate.kcal, r.reference?.kcal ?? null);
    if (k !== null) hits.push(Math.abs(k) <= HIT_BAND * 100);
  }

  const kcalBias = median(errs.kcal);
  const iqr =
    errs.kcal.length > 0 ? quantile(errs.kcal, 0.75) - quantile(errs.kcal, 0.25) : null;
  const hitRate = hits.length === 0 ? null : (hits.filter(Boolean).length / hits.length) * 100;

  console.log("\n--- headline ---------------------------------------------");
  console.log(`kcal bias (median signed %)   ${fmt(kcalBias)}%`);
  console.log(`kcal spread (IQR of signed %) ${fmt(iqr)} pp`);
  console.log(`hit rate (within +/-25% kcal) ${fmt(hitRate)}%`);
  console.log(`protein bias (median signed)  ${fmt(median(errs.protein_g))}%`);

  // ------------------------------------------------------------- stability
  // Within-item coefficient of variation across repeats: the direct
  // measurement of the noise S35 says is the expensive kind of error. If this
  // comes back as exactly 0.0, the cache defeated the repeats -- see the
  // header of run.mjs.
  const byId = new Map();
  for (const r of answered) {
    if (!byId.has(r.id)) byId.set(r.id, []);
    byId.get(r.id).push(r.result.estimate.kcal);
  }
  const cvs = [];
  for (const [, vals] of byId) {
    if (vals.length < 2) continue;
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean === 0) continue;
    const sd = Math.sqrt(
      vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1),
    );
    cvs.push((sd / mean) * 100);
  }
  const cv = median(cvs);
  console.log(`run-to-run CV (median, kcal)  ${fmt(cv)}%`);
  if (cv === 0 && cvs.length > 0) {
    console.log("  ^ exactly zero across every fixture means the cache was not bypassed.");
  }

  // -------------------------------------------------------- per-stratum bias
  // The table that tests whether the bias is constant. See the header.
  console.log("\n--- bias by stratum (the S35 constancy check) -------------");
  console.log("stratum        n   kcal bias   IQR     hit rate");
  const strata = [...new Set(scored.map((r) => r.stratum))];
  for (const s of strata) {
    const rows = answered.filter((r) => r.stratum === s);
    const e = rows
      .map((r) => pctError(r.result.estimate.kcal, r.reference?.kcal ?? null))
      .filter((v) => v !== null);
    const h = e.filter((v) => Math.abs(v) <= HIT_BAND * 100).length;
    console.log(
      `${s.padEnd(14)} ${String(e.length).padStart(2)}   ` +
        `${fmt(median(e)).padStart(7)}%  ` +
        `${fmt(e.length > 0 ? quantile(e, 0.75) - quantile(e, 0.25) : null).padStart(6)}  ` +
        `${fmt(e.length === 0 ? null : (h / e.length) * 100).padStart(6)}%`,
    );
  }

  // ------------------------------------------------------------ per-macro
  console.log("\n--- bias by macro ----------------------------------------");
  for (const f of FIELDS) {
    const e = errs[f];
    console.log(
      `${f.padEnd(12)} n=${String(e.length).padStart(3)}  ` +
        `median ${fmt(median(e)).padStart(8)}%   IQR ${fmt(
          e.length > 0 ? quantile(e, 0.75) - quantile(e, 0.25) : null,
        ).padStart(7)} pp`,
    );
  }

  // ---------------------------------------------------------- the rule cases
  // Right-or-wrong, never pooled into the numbers above.
  console.log("\n--- rules (right/wrong, not pooled) ----------------------");
  const refs = new Map();
  for (const r of results) if (r.reference) refs.set(r.id, r.reference);
  const byRule = new Map();
  for (const r of rules) {
    if (!byRule.has(r.id)) byRule.set(r.id, []);
    byRule.get(r.id).push(r);
  }
  for (const [id, rows] of byRule) {
    const first = rows[0];
    let passes = 0;
    for (const r of rows) {
      if (first.expect === "vague") {
        if (r.result.status === "vague") passes++;
      } else if (first.expect === "ratio") {
        const base = refs.get(first.of);
        if (base && r.result.status === "ok") {
          const want = base.kcal * first.times;
          // A wide band on purpose: this asks whether the portion was SCALED,
          // not whether the food was estimated well. Missing the multiple is a
          // different bug from being 20% out on a bowl of rice.
          if (Math.abs(pctError(r.result.estimate.kcal, want)) <= 30) passes++;
        }
      }
    }
    const got = rows.map((r) =>
      r.result.status === "ok" ? `${Math.round(r.result.estimate.kcal)}` : r.result.status,
    );
    console.log(
      `${id.padEnd(24)} ${passes}/${rows.length}  expect=${first.expect}  got: ${got.join(", ")}`,
    );
  }

  // ------------------------------------------------------------- the caveat
  const n = byId.size;
  const halfWidth = n > 0 ? Math.round((2 * 35) / Math.sqrt(n)) : null;
  console.log("\n--- how much to read into this ---------------------------");
  console.log(
    `${n} fixtures. At the ~35pp per-item error SD in the published literature,`,
  );
  console.log(
    `the 95% CI on that bias number is roughly +/-${halfWidth}pp. Enough to tell`,
  );
  console.log(
    `"biased" from "unbiased". NOT enough to separate +5% from +15%, and not`,
  );
  console.log(`enough per stratum to fit a correction factor. Do not try.`);
  console.log(
    `\nAnd the reference has its own error: +/-5% here (CNF lab values, stated`,
  );
  console.log(
    `weights). A measured error smaller than that is not a measurement.`,
  );
}

const arg = process.argv[2];
if (arg) {
  score(arg);
} else {
  const dir = join(HERE, "runs");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl"))
    .sort();
  if (files.length === 0) {
    console.error("No runs yet. node scripts/eval/run.mjs --confirm");
    process.exit(1);
  }
  score(join(dir, files[files.length - 1]));
}
