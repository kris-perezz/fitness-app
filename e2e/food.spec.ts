import { test, expect, type Page } from "@playwright/test";

const search = (page: Page) => page.getByPlaceholder("Search for a food");

async function openSheetAndPickEgg(page: Page) {
  await page.goto("/log");
  await page.getByRole("button", { name: "Add food to Breakfast" }).click();
  await search(page).fill("egg");
  await page.getByRole("dialog").locator("li button").first().click();
}

test("Back from the quantity step keeps the search text", async ({ page }) => {
  await openSheetAndPickEgg(page);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(search(page)).toHaveValue("egg");
});

test("a logged food shows on /log and deletes for good", async ({ page }) => {
  await openSheetAndPickEgg(page);
  const name = (await page.getByRole("dialog").getByRole("heading", { level: 3 }).innerText()).trim();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText(`Added ${name}`)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  const rows = page.locator("main li button").filter({ hasText: name });
  const entry = rows.first();
  await expect(entry).toBeVisible();
  // Relative, so an entry stranded by an earlier crashed run cannot fail this one.
  const logged = await rows.count();
  try {
    await entry.click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByText(`Deleted ${name}`)).toBeVisible();
    // The delete is only committed once the 5s undo toast closes.
    await expect(page.getByRole("button", { name: "Undo" })).toBeHidden({ timeout: 10_000 });
    await page.waitForTimeout(500);
  } finally {
    await page.reload();
  }
  await expect(rows).toHaveCount(logged - 1);
});
