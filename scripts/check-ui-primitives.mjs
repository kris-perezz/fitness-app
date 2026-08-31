#!/usr/bin/env node
/**
 * Flags hand-written markup that has a shadcn registry equivalent.
 *
 * This exists because "prefer the registry component" is unenforceable advice
 * on its own -- the failure mode is not disagreement, it is not looking. Every
 * rule below matches a shape that was actually hand-rolled in this repo.
 *
 * Escape hatch: put `ui-check-ignore` in a comment on the flagged line or the
 * one above it, with a reason. Some of these are legitimately the right call.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Paths are compared with forward slashes so one form works on every OS. */
const slash = (p) => p.split("\\").join("/");

const RULES = [
  {
    registry: "input-group",
    hint: "icon or button positioned absolutely inside a field",
    test: (line) => line.includes("absolute") && line.includes("-translate-y-1/2"),
  },
  {
    registry: "spinner",
    hint: "hand-spun loader icon",
    test: (line) => line.includes("animate-spin"),
  },
  {
    registry: "empty",
    hint: "placeholder paragraph standing in for an empty state",
    test: (line) =>
      /className="[^"]*\bpy-\d+\b[^"]*text-center[^"]*text-muted-foreground/.test(line),
  },
  {
    registry: "item",
    hint: "hand-built row button; Item covers media, content and actions",
    test: (line) => line.includes("flex w-full items-center justify-between"),
  },
  {
    registry: "card",
    hint: "hand-built surface; Card carries header, content and footer slots",
    test: (line) =>
      /className="[^"]*\brounded-(lg|xl)\b[^"]*\bborder\b[^"]*\bbg-(card|background)\b/.test(line),
  },
  {
    registry: "field",
    hint: "repeated label + control + hint; Field composes them with the error slot",
    test: (line) => /<Label[^>]*className="[^"]*text-xs text-muted-foreground/.test(line),
  },
];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
      continue;
    }
    // The registry components themselves are what is being recommended, so
    // their own internals are never findings.
    if (full.endsWith(".tsx") && !slash(full).includes("/components/ui/")) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(SRC)) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const exempt =
      line.includes("ui-check-ignore") || (lines[i - 1] ?? "").includes("ui-check-ignore");
    if (exempt) return;

    for (const rule of RULES) {
      if (rule.test(line)) {
        findings.push({
          where: `${slash(relative(ROOT, file))}:${i + 1}`,
          registry: rule.registry,
          hint: rule.hint,
        });
      }
    }
  });
}

if (findings.length === 0) {
  console.log("check:ui - no hand-rolled primitives with a registry equivalent.");
  process.exit(0);
}

console.log(`check:ui - ${findings.length} candidate(s):\n`);
for (const f of findings) {
  console.log(`  ${f.where}`);
  console.log(`    consider: npx shadcn add @shadcn/${f.registry}`);
  console.log(`    ${f.hint}\n`);
}
console.log("Use the component, or add `ui-check-ignore <reason>` where it genuinely does not fit.");
process.exit(1);
