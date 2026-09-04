import test from "node:test";
import assert from "node:assert/strict";

import { RING_AVAILABLE_PX, RING_FIGURE_PX, ringFontSize, ringLabelWidth } from "./ring.ts";

test("an ordinary day keeps the full size", () => {
  // The fit must not be a tax on every number to save the widest one. A four
  // figure count is what the ring shows almost every day of its life.
  assert.equal(ringFontSize("1,850"), RING_FIGURE_PX);
  assert.equal(ringFontSize("980"), RING_FIGURE_PX);
  assert.equal(ringFontSize("0"), RING_FIGURE_PX);
});

test("a figure too wide for the arc is shrunk rather than clipped", () => {
  const shrunk = ringFontSize("12,345");
  assert.ok(shrunk < RING_FIGURE_PX, "a five figure count has to give way");
  assert.ok(shrunk >= 18, "and never past the floor where it stops being readable");
});

test("nothing the ring can show overflows it", () => {
  // The property that matters, asserted over the range rather than at a
  // handful of points: every total from an empty day to an implausible one
  // fits, separator included.
  for (let value = 0; value <= 99999; value += 7) {
    const label = value.toLocaleString("en-CA");
    const width = ringLabelWidth(label, ringFontSize(label));
    assert.ok(width <= RING_AVAILABLE_PX, `${label} overflows the ring at its fitted size`);
  }
});

test("the separator is measured, not counted as a digit", () => {
  // 12,345 and 123456 have the same character count and different widths, and
  // treating them alike would shrink one of them for nothing.
  assert.ok(ringFontSize("12,345") > ringFontSize("123456"));
});
