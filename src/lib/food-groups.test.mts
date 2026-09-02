import test from "node:test";
import assert from "node:assert/strict";

import {
  GROUPS,
  availableOptions,
  cnfCodeOf,
  collapseGroups,
  groupForId,
  valuesForId,
  variantAt,
} from "./food-groups.ts";

/**
 * The curated file is data a person types, so these are the checks a schema
 * would have given for free. They run over EVERY group, so a food added next
 * month is covered without anybody remembering to add a test for it.
 */
test("every variant declares a value for every axis its group has", () => {
  for (const group of GROUPS) {
    for (const variant of group.variants) {
      for (const axis of group.axes) {
        const value = variant.values[axis.id];
        assert.ok(
          value !== undefined,
          `${variant.id} has no value for axis "${axis.id}" in ${group.key}`,
        );
        assert.ok(
          axis.options.some((o) => o.value === value),
          `${variant.id} has "${value}" for "${axis.id}", which is not one of its options`,
        );
      }
    }
  }
});

test("no two variants occupy the same point, and no id is reused", () => {
  const ids = new Set<string>();
  for (const group of GROUPS) {
    const points = new Set<string>();
    for (const variant of group.variants) {
      assert.ok(!ids.has(variant.id), `${variant.id} appears in two groups`);
      ids.add(variant.id);

      const point = group.axes.map((a) => `${a.id}=${variant.values[a.id]}`).join(",");
      assert.ok(!points.has(point), `${group.key} has two variants at ${point}`);
      points.add(point);
    }
  }
});

test("a group is worth having only if it has more than one variant", () => {
  // A single-variant group renders no controls and collapses nothing, so it is
  // curation that bought nothing -- a food with one form needs no entry here.
  for (const group of GROUPS) {
    assert.ok(group.variants.length > 1, `${group.key} has one variant`);
  }
});

test("group keys are namespaced by their source and never span one", () => {
  // A form group never mixes provenances (S92): a Health Canada number and a
  // hand-typed one must not sit behind the same toggle. The prefix says which,
  // and the ids have to agree with it.
  for (const group of GROUPS) {
    const [prefix] = group.key.split(":");
    for (const variant of group.variants) {
      assert.ok(
        variant.id.startsWith(`${prefix}_`),
        `${variant.id} does not belong in ${group.key}`,
      );
    }
  }
});

test("the grid is sparse, and unreachable combinations are not offered", () => {
  const chicken = groupForId("cnf_841");
  assert.ok(chicken);

  // Grilled-with-skin does not exist in CNF, so holding skin at "on" must offer
  // raw and cooked -- but the cooked row behind it is the roasted one, and
  // asking for the grid's empty corner must return nothing rather than a guess.
  const withSkin = availableOptions(chicken, "state", { skin: "on" });
  assert.deepEqual([...withSkin].sort(), ["cooked", "raw"]);
  assert.equal(variantAt(chicken, { state: "cooked", skin: "on" })?.id, "cnf_839");
  assert.equal(variantAt(chicken, { state: "cooked", skin: "off" })?.id, "cnf_7322");
  assert.equal(variantAt(chicken, { state: "braised", skin: "on" }), null);
});

test("options narrow to what is actually in the catalog", () => {
  const chicken = groupForId("cnf_841");
  assert.ok(chicken);

  // Only the skinless pair materialised. Offering "with skin" would put a
  // toggle in front of a row that does not exist.
  const present = new Set(["cnf_841", "cnf_7322"]);
  assert.deepEqual([...availableOptions(chicken, "skin", { state: "raw" }, present)], ["off"]);
  assert.deepEqual(
    [...availableOptions(chicken, "state", { skin: "off" }, present)].sort(),
    ["cooked", "raw"],
  );
});

test("search collapses a group to one row, keeping the best-ranked member", () => {
  const ranked = [
    { id: "cnf_7322" }, // matched "grilled", so it ranked first
    { id: "cnf_841" },
    { id: "off_123" },
    { id: "cnf_838" },
  ];
  const collapsed = collapseGroups(ranked, (r) => r.id);

  // One chicken row, and it is the one ranking put on top -- not whichever
  // variant the curated file happens to list first.
  assert.deepEqual(collapsed.map((r) => r.id), ["cnf_7322", "off_123"]);
});

test("a food in no group passes through untouched", () => {
  assert.equal(groupForId("off_5000159407236"), null);
  assert.equal(valuesForId("seed_milk"), null);

  const rows = [{ id: "seed_milk" }, { id: "label_1" }];
  assert.deepEqual(collapseGroups(rows, (r) => r.id), rows);
});

test("a catalog id yields its CNF code, and nothing else does", () => {
  assert.equal(cnfCodeOf("cnf_841"), 841);
  assert.equal(cnfCodeOf("off_841"), null);
  assert.equal(cnfCodeOf("cnf_abc"), null);
});
