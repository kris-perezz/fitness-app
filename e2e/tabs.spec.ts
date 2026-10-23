import { test, expect } from "@playwright/test";

const TABS = [
  { name: "Train", url: /\/train/ },
  { name: "Progress", url: /\/progress/ },
  { name: "Profile", url: /\/goals/ },
  { name: "Food", url: /\/log/ },
];

test("second visit to each tab is instant and skeleton-free", async ({ page }) => {
  await page.goto("/log");
  // Lets the nav's prefetches land; the second lap depends on them.
  await page.waitForTimeout(2000);
  const nav = page.locator("[data-slot=nav-bar]");

  for (const lap of [1, 2]) {
    for (const tab of TABS) {
      // A skeleton can flash for a frame, so watch for one instead of sampling.
      await page.evaluate(() => {
        const w = window as unknown as { __skeleton: boolean };
        w.__skeleton = false;
        new MutationObserver(() => {
          if (document.querySelector("[data-slot=skeleton]")) w.__skeleton = true;
        }).observe(document.body, { childList: true, subtree: true });
      });
      await nav.getByRole("link", { name: tab.name }).click();
      await expect(page).toHaveURL(tab.url, { timeout: 300 });
      await page.waitForTimeout(700);
      if (lap === 2) {
        expect(await page.evaluate(() => (window as unknown as { __skeleton: boolean }).__skeleton), `${tab.name} showed a skeleton`).toBe(false);
      }
    }
  }
});
