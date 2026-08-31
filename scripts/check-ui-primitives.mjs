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
    // Widened after a real miss. This used to require `bg-(card|background)` in
    // the same class list, and the hand-rolled surface in train-screen.tsx set
    // no background at all -- a rounded border with padding is already a card
    // whether or not it is tinted, so requiring the tint asked for the one
    // detail a hand-roll is least likely to bother with.
    hint: "hand-built surface; Card carries header, content and footer slots",
    test: (line) =>
      /className="[^"]*\brounded-(md|lg|xl|2xl)\b/.test(line) &&
      /className="[^"]*\bborder\b/.test(line) &&
      /className="[^"]*\bp[xy]?-\d/.test(line),
  },
  {
    registry: "field",
    // Widened after a second miss. This matched the label's classes as a
    // literal, so hoisting them into `const fieldLabel = "..."` made every
    // field on the login page invisible to it. A rule that only sees one
    // spelling of a shape is a rule that rewards renaming, so the const is now
    // followed to its declaration.
    hint: "repeated label + control + hint; Field composes them with the error slot",
    test: (line, lines) => {
      if (!/<Label\b/.test(line)) return false;
      if (/className="[^"]*text-xs[^"]*text-muted-foreground/.test(line)) return true;
      const ref = line.match(/className=\{(\w+)\}/);
      if (!ref) return false;
      const decl = lines.find((l) => {
        const m = l.match(/(?:const|let|var)\s+(\w+)\s*=/);
        return m !== null && m[1] === ref[1];
      });
      return decl ? /text-xs[^"]*text-muted-foreground/.test(decl) : false;
    },
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
      if (rule.test(line, lines)) {
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
