#!/usr/bin/env node
/**
 * Flags blurs that drop frames: a large radius, a CSS filter blur, or a
 * backdrop blur on an element that animates (docs rule P2).
 *
 * Escape hatch: `paint-check-ignore` in a comment on the line, with a reason.
 */
import { globSync, readFileSync } from "node:fs";

const RULES = [
  { pattern: /\bbackdrop-blur-(lg|xl|2xl|3xl)\b/, hint: "backdrop blur above md" },
  { pattern: /filter:\s*blur\(/, hint: "filter blur in CSS; soften the gradient instead" },
  {
    pattern: /backdrop-blur.*(animate-in|fade-in|zoom-in|slide-in)|(animate-in|fade-in|zoom-in|slide-in).*backdrop-blur/,
    hint: "animated element carries a backdrop blur; it is re-blurred every frame",
  },
];

let failures = 0;
for (const file of globSync("src/**/*.{ts,tsx,css}")) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("paint-check-ignore")) return;
      for (const { pattern, hint } of RULES) {
        if (!pattern.test(line)) continue;
        failures++;
        console.log(`${file.split("\\").join("/")}:${i + 1}  ${hint}`);
      }
    });
}

if (failures) process.exit(1);
console.log("check:paint - no oversized blurs.");
