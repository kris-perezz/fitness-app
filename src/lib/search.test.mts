import assert from "node:assert/strict";
import { test } from "node:test";

import { searchNamed } from "./search.ts";

const item = (name: string, aliases: string[] = []) => ({ name, aliases });

test("a name prefix beats an alias prefix", () => {
  const items = [item("Arroz caldo", ["chicken rice porridge"]), item("Chicken breast")];
  assert.deepEqual(searchNamed(items, "chicken").map((i) => i.name), ["Chicken breast", "Arroz caldo"]);
});

test("an exact alias still beats a name prefix", () => {
  const items = [item("Pushdown machine row"), item("Tricep Rope Pushdown", ["pushdown"])];
  assert.equal(searchNamed(items, "pushdown")[0].name, "Tricep Rope Pushdown");
});
