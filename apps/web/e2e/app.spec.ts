import { expect, test } from "@playwright/test";

test("first-run account screen is usable", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading")).toBeVisible();
  await expect(page.locator("body")).not.toHaveText(/Welcome back/i);
  await expect(page.locator("body")).not.toHaveText(/revolutionize/i);
});

test("health endpoint is up", async ({ request }) => {
  const res = await request.get("http://127.0.0.1:8787/health");
  expect(res.ok()).toBeTruthy();
});
