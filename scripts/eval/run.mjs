/**
 * Run the fixture set through estimateFromDescription and record every raw
 * answer. Scoring is a separate script on purpose (see score.mjs).
 *
 * THIS SPENDS MONEY. It makes one API call per fixture per repeat and refuses
 * to start without --confirm, after printing the call count.
 *
 * NODE 24. describe.ts is TypeScript and this imports it directly, which needs
 * the type stripping added in 22.6. The repo's engines field already says >=24;
 * if you are on 20 (nvm use 24.11.0) this fails immediately with a syntax
 * error rather than anything subtle.
 *
 * ------------------------------------------------------------------ the cache
 *
 * describe.ts holds a module-level Map keyed on the normalised description and
 * a hash of the image. It is right for the app and it would silently destroy
 * this measurement: every repeat after the first would replay run 1's answer,
 * and the run-to-run spread -- the whole point of repeating -- would come back
 * as exactly 0.0 with no error and no warning.
 *
 * It cannot be defeated by perturbing the string. cacheKey lowercases, trims
 * and collapses whitespace, so the obvious tricks are normalised away, and
 * appending a character changes the prompt, which is a confound rather than a
 * fix.
 *
 * So each repeat imports the module afresh through a distinct query string.
 * Node's ESM loader keys its module cache on the full specifier, so `?run=2`
 * is a different module with a different, empty Map. The cost is a re-parse
 * per repeat, which is nothing beside a 30-second API call.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const DESCRIBE = pathToFileURL(join(ROOT, "src", "lib", "describe.ts")).href;

const REPEATS = Number(process.env.EVAL_REPEATS ?? 3);

/**
 * Next loads .env.local for the app; a bare node script does not, and the key
 * lives there rather than in the shell on this machine.
 */
function loadEnv() {
  for (const name of [".env.local", ".env"]) {
    const path = join(ROOT, name);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}

async function main() {
  loadEnv();

  const fixtures = JSON.parse(readFileSync(join(HERE, "fixtures.json"), "utf8"));
  const cases = [
    ...fixtures.strata.cnf_single.map((f) => ({ ...f, kind: "scored" })),
    ...fixtures.strata.chain.map((f) => ({ ...f, kind: "scored" })),
    ...fixtures.strata.packaged.map((f) => ({ ...f, kind: "scored" })),
    ...fixtures.strata.rules.map((f) => ({ ...f, stratum: "rules", kind: "rule" })),
  ];

  const calls = cases.length * REPEATS;
  if (!process.argv.includes("--confirm")) {
    console.log(`${cases.length} fixtures x ${REPEATS} repeats = ${calls} API calls.`);
    console.log("Re-run with --confirm to spend that.");
    console.log("Set EVAL_REPEATS to change the repeat count.");
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set, and no .env.local supplied one.");
    process.exit(1);
  }

  // Recorded alongside the results: a run is only comparable to another run
  // with the same model, effort and prompt. score.mjs refuses to compare
  // across a prompt change rather than quietly reporting a drift that is
  // actually a rewrite.
  const source = readFileSync(join(ROOT, "src", "lib", "describe.ts"), "utf8");
  const meta = {
    started: new Date().toISOString(),
    model: source.match(/const MODEL = "([^"]+)"/)?.[1] ?? "unknown",
    reasoning_effort: source.match(/const REASONING_EFFORT = "([^"]+)"/)?.[1] ?? "unknown",
    prompt_hash: await sha256(source.match(/const PROMPT = `([\s\S]*?)`;/)?.[1] ?? ""),
    repeats: REPEATS,
    fixture_count: cases.length,
  };

  mkdirSync(join(HERE, "runs"), { recursive: true });
  const out = join(HERE, "runs", `${meta.started.replace(/[:.]/g, "-")}.jsonl`);
  const lines = [JSON.stringify({ type: "meta", ...meta })];

  for (let run = 0; run < REPEATS; run++) {
    // A fresh module, and therefore a fresh cache, per repeat. See the header.
    const { estimateFromDescription } = await import(`${DESCRIBE}?run=${run}`);

    for (const c of cases) {
      const started = Date.now();
      let result;
      try {
        result = await estimateFromDescription(c.text, null);
      } catch (err) {
        // estimateFromDescription documents that it never throws. If it does,
        // that is a finding, so record it rather than aborting the run.
        result = { status: "threw", message: String(err) };
      }
      const row = {
        type: "result",
        run,
        id: c.id,
        stratum: c.stratum,
        kind: c.kind,
        text: c.text,
        reference: c.reference ?? null,
        expect: c.expect ?? null,
        of: c.of ?? null,
        times: c.times ?? null,
        ms: Date.now() - started,
        result,
      };
      lines.push(JSON.stringify(row));
      const shown =
        result.status === "ok" ? `${Math.round(result.estimate.kcal)} kcal` : result.status;
      console.log(`run ${run}  ${c.id.padEnd(22)} ${shown}`);
    }
  }

  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`\nWrote ${out}`);
  console.log(`Score it:  node scripts/eval/score.mjs "${out}"`);
}

async function sha256(text) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

await main();
