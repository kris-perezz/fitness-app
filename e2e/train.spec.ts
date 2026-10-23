import { test, expect, type Page } from "@playwright/test";

async function discardSession(page: Page) {
  await page.getByRole("button", { name: /^(Discard|Delete) session$/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^(Discard|Delete)$/ }).click();
  await expect(page).toHaveURL(/\/train$/);
}

test("editing a set and tapping Add set leaves one form open", async ({ page }) => {
  await page.goto("/train");
  await page.getByRole("button", { name: /Start today's workout|Open today's session/ }).click();
  await expect(page).toHaveURL(/\/train\/[\w-]+$/);
  try {
    await page.getByRole("button", { name: "Add exercise" }).click();
    await page.getByPlaceholder("Search exercises").fill("barbell bench press");
    await page.getByRole("dialog").locator("li button").first().click();

    await page.getByRole("button", { name: "Add set" }).click();
    await page.getByLabel(/^Load/).fill("100");
    await page.getByLabel("Reps", { exact: true }).fill("5");
    await page.getByRole("button", { name: "Add set" }).click();
    await expect(page.getByRole("button", { name: "Edit set 1" })).toBeEnabled();

    await page.getByRole("button", { name: "Edit set 1" }).click();
    await expect(page.getByLabel("Reps", { exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Add set" }).click();
    await expect(page.getByLabel("Reps", { exact: true })).toHaveCount(1);
  } finally {
    await discardSession(page);
  }
});
