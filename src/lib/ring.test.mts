import test from "node:test";
import assert from "node:assert/strict";

import {
  RING_AVAILABLE_PX,
  RING_CIRCUMFERENCE,
  RING_FIGURE_PX,
  RING_RADIUS,
  RING_SIZE,
  RING_STROKE,
  ringFontSize,
  ringGeometry,
  ringLabelWidth,
} from "./ring.ts";

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

test("one ring in one ring's geometry is the calorie ring's own numbers", () => {
  // S89 generalises this function FROM the calorie ring rather than beside
  // it -- the ringCount=1 case has to reproduce RING_RADIUS/RING_CIRCUMFERENCE
  // exactly, or the two have quietly become two implementations.
  const single = ringGeometry(RING_SIZE, 0, 1, RING_STROKE);
  assert.equal(single.radius, RING_RADIUS);
  assert.equal(single.circumference, RING_CIRCUMFERENCE);
});

test("each further ring sits strictly inside the one before it", () => {
  const size = 36;
  const stroke = 2;
  const radii = [0, 1, 2, 3].map((i) => ringGeometry(size, i, 4, stroke).radius);
  for (let i = 1; i < radii.length; i++) {
    assert.ok(radii[i] < radii[i - 1], `ring ${i} did not nest inside ring ${i - 1}`);
  }
});

test("every ring in a four-ring mark stays a positive, drawable radius", () => {
  const size = 36;
  const stroke = 2;
  for (let i = 0; i < 4; i++) {
    const { radius } = ringGeometry(size, i, 4, stroke);
    assert.ok(radius > 0, `ring ${i} of 4 has a non-positive radius at size ${size}`);
  }
});

test("circumference is always the geometry of that ring's own radius", () => {
  const { radius, circumference } = ringGeometry(36, 2, 4, 2);
  assert.equal(circumference, 2 * Math.PI * radius);
});

test("widening the gap shrinks inner rings without moving the outermost one", () => {
  // Ring 0's radius never depends on `gap` -- it is only ever subtracted for
  // rings after the first, so the outermost ring (and the single calorie
  // ring, which is always index 0) is identical whatever gap the caller picks.
  const tight = ringGeometry(36, 0, 4, 2, 0.5);
  const wide = ringGeometry(36, 0, 4, 2, 3);
  assert.equal(tight.radius, wide.radius);

  const tightInner = ringGeometry(36, 1, 4, 2, 0.5);
  const wideInner = ringGeometry(36, 1, 4, 2, 3);
  assert.ok(wideInner.radius < tightInner.radius);
});
