import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const PAGES = ["/log", "/train", "/progress", "/goals", "/trends", "/recipes", "/foods"];
const TAGS = ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"];

async function expectNoViolations(page: Page, scope?: string) {
  const axe = new AxeBuilder({ page }).withTags(TAGS);
  if (scope) axe.include(scope);
  const { violations } = await axe.analyze();
  // One line per element, with axe's own reason, which carries the measured ratio.
  const report = violations
    .flatMap((v) => v.nodes.map((n) => `${v.id} ${n.target.join(" ")}: ${n.any[0]?.message ?? n.failureSummary}`))
    .join("\n");
  expect(report).toBe("");
}

for (const path of PAGES) {
  test(`${path} has no accessibility violations`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expectNoViolations(page);
  });
}

test("add-food sheet has no accessibility violations", async ({ page }) => {
  await page.goto("/log");
  await page.getByRole("button", { name: "Add food to Breakfast" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expectNoViolations(page, '[role="dialog"]');
});
