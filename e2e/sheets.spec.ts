import { test, expect, type Page } from "@playwright/test";

const addFood = (page: Page) => page.getByRole("button", { name: "Add food to Breakfast" });
const drawer = (page: Page) => page.getByRole("dialog");

test("browser back closes the add sheet and stays on /log", async ({ page }) => {
  await page.goto("/log");
  await addFood(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.goBack();
  await expect(drawer(page)).toBeHidden();
  await expect(page).toHaveURL(/\/log$/);
});

test("closing the add sheet with Escape leaves no history entry", async ({ page }) => {
  await page.goto("/train");
  await page.locator("[data-slot=nav-bar]").getByRole("link", { name: "Food" }).click();
  await expect(page).toHaveURL(/\/log$/);
  await addFood(page).click();
  await expect(drawer(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toBeHidden();
  // The sheet pops its marker on a timer; give it time to leave a stale entry.
  await page.waitForTimeout(300);
  await page.goBack();
  await expect(page).toHaveURL(/\/train/);
});

async function deleteOpenRecipe(page: Page) {
  await page.getByRole("button", { name: "Delete recipe" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete", exact: true }).click();
}

async function deleteStrayRecipes(page: Page) {
  for (let n = 0; n < 5; n++) {
    const link = page.getByRole("link", { name: /TEST e2e recipe/ }).first();
    if (!(await link.isVisible())) return;
    await link.click();
    await deleteOpenRecipe(page);
    await expect(page).toHaveURL(/\/recipes$/);
  }
}

test("creating a recipe from the New sheet opens it", async ({ page }) => {
  await page.goto("/recipes");
  try {
    await page.getByRole("button", { name: "New recipe" }).click();
    await page.getByLabel("What is the dish called?").fill("TEST e2e recipe");
    await page.getByRole("button", { name: "Create", exact: true }).click();
    await expect(page).toHaveURL(/\/recipes\/[\w-]+$/);
    await deleteOpenRecipe(page);
    await expect(page).toHaveURL(/\/recipes$/);
  } finally {
    // A recipe saved without navigating would otherwise be left behind.
    await page.goto("/recipes");
    await deleteStrayRecipes(page);
  }
  await page.reload();
  await expect(page.getByText("TEST e2e recipe")).toHaveCount(0);
});
