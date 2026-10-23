import { test, expect, type Page } from "@playwright/test";

// One test per rule in docs/parked/ui-rules.md, run at phone and desktop width.

const PAGES = ["/log", "/train", "/progress", "/goals", "/trends", "/recipes", "/foods"];

// A frame over 50 ms is a long animation frame: the point where motion visibly stutters.
const LONG_FRAME_MS = 50;
const INP_GOOD_MS = 200;
const CLS_GOOD = 0.1;

const isDesktop = (page: Page) => (page.viewportSize()?.width ?? 0) >= 768;

/** Records every frame gap and every slow interaction until `stop` is called. */
async function startRecording(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __events: number[]; __stop: boolean };
    w.__frames = [];
    w.__events = [];
    w.__stop = false;
    let last = performance.now();
    const tick = (now: number) => {
      w.__frames.push(now - last);
      last = now;
      if (!w.__stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) w.__events.push(e.duration);
    }).observe({ type: "event", durationThreshold: 16 } as PerformanceObserverInit);
  });
}

async function stopRecording(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __events: number[]; __stop: boolean };
    w.__stop = true;
    return { frames: w.__frames.slice(1), events: w.__events };
  });
}

const SHEETS = [
  { page: "/log", open: (p: Page) => p.getByRole("button", { name: "Add food to Breakfast" }).click() },
  { page: "/recipes", open: (p: Page) => p.getByRole("button", { name: "New recipe" }).click() },
];

for (const sheet of SHEETS) {
  test(`P1-P3: opening the sheet on ${sheet.page} is smooth and fast`, async ({ page }) => {
    await page.goto(sheet.page);
    await page.waitForLoadState("networkidle");
    await startRecording(page);
    await sheet.open(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.waitForTimeout(600); // the open animation, plus margin
    const { frames, events } = await stopRecording(page);

    expect(Math.max(...frames), "longest frame while opening (ms)").toBeLessThanOrEqual(LONG_FRAME_MS);
    expect(Math.max(0, ...events), "slowest interaction (ms)").toBeLessThanOrEqual(INP_GOOD_MS);
  });

  test(`S1: the sheet on ${sheet.page} is a bottom sheet on a phone, centered on desktop`, async ({ page }) => {
    await page.goto(sheet.page);
    await sheet.open(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(600);
    const box = (await dialog.boundingBox())!;
    // Measured as a fixed element sees it: the reserved scrollbar gutter is not part of it.
    const view = await page.evaluate(() => {
      const probe = document.body.appendChild(document.createElement("div"));
      probe.style.cssText = "position:fixed;inset:0;visibility:hidden";
      const { width, height } = probe.getBoundingClientRect();
      probe.remove();
      return { width, height };
    });
    if (isDesktop(page)) {
      expect(Math.abs(box.x + box.width / 2 - view.width / 2), "horizontal offset from center").toBeLessThan(2);
      expect(Math.abs(box.y + box.height / 2 - view.height / 2), "vertical offset from center").toBeLessThan(2);
    } else {
      expect(Math.abs(box.y + box.height - view.height), "gap below the sheet").toBeLessThan(2);
    }
  });

  test(`L1: opening the sheet on ${sheet.page} does not move the page`, async ({ page }) => {
    await page.goto(sheet.page);
    const main = page.locator("main").first();
    const before = (await main.boundingBox())!;
    await sheet.open(page);
    await expect(page.getByRole("dialog")).toBeVisible();
    const after = (await main.boundingBox())!;
    expect(after.x, "page moved sideways when the sheet opened").toBe(before.x);
  });
}

for (const path of PAGES) {
  test(`L1: ${path} does not shift as it loads`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          new PerformanceObserver((list) => {
            for (const e of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
              if (!e.hadRecentInput) total += e.value;
            }
          }).observe({ type: "layout-shift", buffered: true });
          setTimeout(() => resolve(total), 100);
        }),
    );
    expect(cls, "cumulative layout shift").toBeLessThanOrEqual(CLS_GOOD);
  });

  test(`T1: nothing on ${path} scrolls inside the page`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const inner = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((el) => {
          if (el.closest("[role=dialog]")) return false;
          const { overflowY } = getComputedStyle(el);
          return (overflowY === "auto" || overflowY === "scroll") && el.scrollHeight > el.clientHeight + 1;
        })
        .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join(".")}`),
    );
    expect(inner, "elements with their own vertical scroll").toEqual([]);
  });
}

for (const path of ["/recipes", "/foods"]) {
  test(`T2: ${path} shows at most a page of rows before "Show more"`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const more = page.getByRole("button", { name: /^Show \d+ more$/ });
    const rows = page.locator("main li");
    if (await more.isVisible()) {
      await expect(rows).toHaveCount(10);
      await more.click();
      expect(await rows.count()).toBeGreaterThan(10);
    } else {
      expect(await rows.count()).toBeLessThanOrEqual(10);
    }
  });
}
