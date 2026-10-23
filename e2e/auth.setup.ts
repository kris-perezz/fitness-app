import { test as setup, expect } from "@playwright/test";

setup("sign in and set targets", async ({ page }) => {
  const { TEST_EMAIL, TEST_PASSWORD } = process.env;
  if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error("TEST_EMAIL / TEST_PASSWORD missing from .env.test.local");

  // Filled before hydration, the form submits natively and reloads empty.
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(TEST_EMAIL);
  await page.getByLabel("Password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const failure = page.locator("p.text-destructive");
  await Promise.race([page.waitForURL("**/log", { timeout: 15_000 }), failure.waitFor({ timeout: 15_000 })]);
  await expect(failure, "sign-in error").toBeHidden();
  await expect(page).toHaveURL(/\/log/);

  // A fresh account has no targets, and Food shows a card asking for them.
  if (await page.getByText("Set your targets").isVisible()) {
    await page.goto("/goals", { waitUntil: "networkidle" });
    // Targets only exist in strict mode; the field is not rendered until it is on.
    const strict = page.getByRole("switch", { name: "Strict mode" });
    if ((await strict.getAttribute("aria-checked")) !== "true") await strict.click();
    await page.getByLabel("Daily calories").fill("2000");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Goals saved")).toBeVisible();
    await page.goto("/log");
    await expect(page.getByText("Set your targets")).toBeHidden();
  }

  await page.context().storageState({ path: "e2e/.auth/user.json" });
});
