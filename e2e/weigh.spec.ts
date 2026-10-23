import { test, expect } from "@playwright/test";

test("a weigh-in saves, lists and deletes for good", async ({ page }) => {
  await page.goto("/progress");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: /^(Weigh in|Weighed in)/ }).click();
  await dialog.getByLabel("Weight in pounds").fill("150");
  await dialog.getByRole("button", { name: /^(Weigh in|Save)$/ }).click();
  await expect(dialog).toBeHidden();

  try {
    const row = page.getByRole("listitem").filter({ hasText: "Today" });
    await expect(row).toContainText("150.0 lb");
  } finally {
    await page.getByRole("button", { name: /^Weighed in/ }).click();
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    // The delete is only committed once the 5s undo toast closes.
    await expect(page.getByRole("button", { name: "Undo" })).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.reload();
  }
  await expect(page.getByRole("button", { name: /^Weigh in/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Weighed in/ })).toHaveCount(0);
});
