import test from "node:test";
import assert from "node:assert/strict";

import { cnfFoodId, cnfName, rankCnf } from "./cnf.ts";
import { groupForId } from "./food-groups.ts";

/**
 * Real rows, copied verbatim from the CNF catalog on 2026-09-01. The point of
 * using the actual descriptions is that the ranking is entirely about their
 * shape -- invented ones would test the test.
 */
const CHICKEN = [
  { food_code: 601, food_description: "Chicken, broiler, breast, meat and skin, batter dipped, fried" },
  { food_code: 1220, food_description: "Deli-meat, chicken breast, cooked, extra lean" },
  { food_code: 841, food_description: "Chicken, broiler, breast, skinless, boneless, meat, raw" },
  { food_code: 7322, food_description: "Chicken, broiler, breast, skinless, boneless, meat, grilled" },
  { food_code: 4931, food_description: "Chicken breast with broccoli and cheese stuffing, frozen" },
  { food_code: 4565, food_description: "Fast foods, entree, chicken, breaded and fried, light meat (breast or wing)" },
  { food_code: 6797, food_description: "Fast foods, entree, chicken, breaded and fried, breast, meat only, skin and breading removed" },
  { food_code: 5693, food_description: "Deli-meat, chicken breast, oven-roasted, sliced" },
];

test("the plain food outranks the prepared dish", () => {
  // The whole story: 24 rows match "chicken breast" and CNF's own order is not
  // an answer. A fast-food entree must never be the first thing offered to
  // somebody who typed the name of an ingredient.
  const hits = rankCnf(CHICKEN, "chicken breast");
  const top = hits.slice(0, 2).map((h) => h.code);
  assert.ok(
    top.includes(841) || top.includes(7322),
    `expected a plain chicken breast first, got ${JSON.stringify(hits.slice(0, 2))}`,
  );

  const rank = (code: number) => hits.findIndex((h) => h.code === code);
  assert.ok(rank(841) < rank(4565), "fast-food entree outranked the plain food");
  assert.ok(rank(841) < rank(1220), "deli meat outranked the plain food");
  assert.ok(rank(841) < rank(4931), "a frozen stuffed product outranked the plain food");
});

test("a curated group appears once, and its forms are still separate rows", () => {
  // SUPERSEDES the original of this test, which asserted raw and cooked never
  // fold into one row. The reasoning behind it stands -- a 30% swing hidden
  // behind one name is an error the user cannot see -- but S92 answers it
  // better: the rows stay separate and the choice moves into the drawer, where
  // it can be labelled "Raw / Cooked" instead of being two strings differing in
  // their sixth clause.
  const hits = rankCnf(CHICKEN, "chicken breast");
  const breast = hits.filter((h) => h.code === 841 || h.code === 7322);
  assert.equal(breast.length, 1, "the group should be offered once");

  // Both rows are still real and still reachable -- the group lists them.
  const group = groupForId(cnfFoodId(841));
  assert.equal(group?.variants.length, 4);
  assert.ok(group?.variants.some((v) => v.id === cnfFoodId(7322)));
});

test("a curated group leads, even for a query that names no form", () => {
  // The bug this pins: ranked on CNF's descriptions alone, "chicken" returned
  // 25 rows of feet, giblets and gizzards and not one chicken breast, because
  // every breast row fell outside the limit. The group has to answer to its
  // own name or it is invisible to anybody who does not already know CNF's
  // wording.
  const hits = rankCnf(CHICKEN, "chicken");
  assert.equal(hits[0].code, 841, "the curated group should lead");
});

test("a group matched by name opens on the form the file lists first", () => {
  // Raw and skinless, not whichever sibling happens to score highest on its
  // own wording. Naming a form explicitly still reaches that form.
  assert.equal(rankCnf(CHICKEN, "chicken breast")[0].code, 841);
  assert.equal(rankCnf(CHICKEN, "chicken breast grilled")[0].code, 7322);
});

test("folding happens before the limit, so merged rows do not spend slots", () => {
  // Four rows becoming one must free three slots rather than shorten the list.
  const hits = rankCnf(CHICKEN, "chicken breast", 3);
  assert.equal(hits.length, 3);
  assert.equal(new Set(hits.map((h) => h.code)).size, 3);
});

test("every word typed has to appear", () => {
  // Not fuzzy, on purpose: a wrong food confidently returned is worse than no
  // food, because nothing downstream will ever question it again.
  assert.equal(rankCnf(CHICKEN, "chicken pancreas").length, 0);
  assert.equal(rankCnf(CHICKEN, "").length, 0);
  assert.ok(rankCnf(CHICKEN, "deli chicken").length > 0);
});

test("whole words beat substrings", () => {
  const rows = [
    { food_code: 1, food_description: "Rice, white, long-grain, cooked" },
    { food_code: 2, food_description: "Liquorice, candy" },
  ];
  const hits = rankCnf(rows, "rice");
  assert.equal(hits[0].code, 1, "liquorice matched 'rice' as a substring and won");
});

test("junk rows cannot crash the ranking", () => {
  const rows = [
    { food_code: null, food_description: "Rice, white" },
    { food_code: 3, food_description: "" },
    { food_code: 4 },
    { food_code: 5, food_description: "Rice, white, long-grain, raw" },
  ];
  const hits = rankCnf(rows, "rice");
  assert.deepEqual(
    hits.map((h) => h.code),
    [5],
  );
});

test("a CNF description drops the taxonomy and keeps the preparation", () => {
  // Dropping "grilled" would be a lie by omission at a ~30% margin.
  assert.equal(
    cnfName("Chicken, broiler, breast, skinless, boneless, meat, grilled"),
    "Chicken, breast, grilled",
  );
  assert.equal(
    cnfName("Chicken, broiler, breast, skinless, boneless, meat, raw"),
    "Chicken, breast, raw",
  );
  // "whole" is taxonomy as its own clause.
  assert.equal(cnfName("Egg, whole, raw"), "Egg, raw");
});

test("a description with no taxonomy in it survives untouched", () => {
  // Conservative on purpose: worse to read and never wrong. An earlier version
  // rewrote these into "Rice white, cooked" and "Fast foods entree", losing the
  // food in the second case entirely.
  assert.equal(cnfName("Cheese souffle"), "Cheese souffle");
  assert.equal(cnfName("Rice, white, long-grain, cooked"), "Rice, white, long-grain, cooked");
  const fastFood = "Fast foods, entree, chicken, breaded and fried, light meat (breast or wing)";
  assert.equal(cnfName(fastFood), fastFood);
});

test("the id is the CNF food code, so a row can be traced back", () => {
  assert.equal(cnfFoodId(841), "cnf_841");
});
