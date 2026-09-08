import test from "node:test";
import assert from "node:assert/strict";

import { SWIPE_PX, swipeDirection } from "./swipe.ts";

test("a clear horizontal drag pages the way it went", () => {
  assert.equal(swipeDirection(-80, 4), "left");
  assert.equal(swipeDirection(80, -4), "right");
});

test("a tap with a shaky thumb is not a swipe", () => {
  assert.equal(swipeDirection(0, 0), null);
  assert.equal(swipeDirection(-(SWIPE_PX - 1), 0), null);
});

test("a diagonal drag down the page is somebody scrolling", () => {
  // The worst reading of a scroll is paging the month out from under it, so
  // the horizontal component has to beat the vertical one outright.
  assert.equal(swipeDirection(-60, 90), null);
  assert.equal(swipeDirection(60, -90), null);
});
