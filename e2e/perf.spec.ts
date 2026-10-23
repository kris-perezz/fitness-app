import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ROUTES = ["/log", "/train", "/progress", "/goals", "/trends", "/recipes"];
const BASELINE = "e2e/perf-baseline.json";

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("route response times stay near baseline", async ({ page }) => {
  const now: Record<string, number> = {};
  for (const route of ROUTES) {
    const times: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = performance.now();
      await page.request.get(route);
      times.push(performance.now() - t);
    }
    // The first fetch is cold and says nothing about steady state.
    now[route] = Math.round(median(times.slice(1)));
  }

  if (!existsSync(BASELINE)) {
    writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n");
    console.log("perf baseline written", now);
    return;
  }

  const base: Record<string, number> = JSON.parse(readFileSync(BASELINE, "utf8"));
  const rows = ROUTES.map((r) => ({ route: r, baseline: base[r], now: now[r], delta: base[r] == null ? 0 : now[r] - base[r] }));
  console.table(rows);
  const slow = rows.filter((r) => r.baseline != null && r.delta > 80 && r.now > r.baseline * 1.3);
  expect(slow, "routes slower than baseline").toEqual([]);
});
