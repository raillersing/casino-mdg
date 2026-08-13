import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const tablesPayload = {
  results: [
    {
      id: "table-emerald",
      table_code: "EMERALD-01",
      name: "Table Émeraude",
      game_type: "poker",
      stakes: "50 / 100",
      max_players: 6,
      player_count: 2,
      status: "open",
      is_private: false,
    },
  ],
};

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    results.violations
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join("\n"),
  ).toEqual([]);
}

test("home is accessible", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);
});

test("authentication is accessible", async ({ page }) => {
  await page.goto("/auth");
  await expectAccessible(page);
});

test("lobby is accessible with tables loaded", async ({ page }) => {
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tablesPayload),
    }),
  );
  await page.goto("/lobby");
  await expect(page.getByText("Table Émeraude")).toBeVisible();
  await expectAccessible(page);
});

test("mobile navigation opens and closes accessibly", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const menu = page.locator(".mobile-menu");
  await expect(menu).toHaveAccessibleName("Ouvrir le menu");
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("navigation", { name: "Navigation principale" }),
  ).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveAccessibleName("Ouvrir le menu");
  await expect(menu).toHaveAttribute("aria-expanded", "false");
});
