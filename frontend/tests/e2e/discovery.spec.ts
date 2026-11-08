import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`game discovery and navigation at ${width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/games/tables/**", (route) =>
      route.fulfill({ json: { results: [] } }),
    );
    await page.goto("/games");
    await expect(page.locator(".discovery-card")).toHaveCount(5);
    for (const cover of await page.locator(".discovery-art img").all()) {
      await cover.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          cover.evaluate((image) => (image as HTMLImageElement).naturalWidth),
        )
        .toBeGreaterThan(0);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page
        .locator(".discovery-card")
        .first()
        .evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeLessThan(900);
    await page.screenshot({
      path: `../reports/discovery-games-${width}.png`,
      fullPage: true,
    });
    await page.locator(".discovery-card").first().click();
    await expect(page).toHaveURL(/\/(lobby|play)\/belote$/);
    await page
      .getByRole("link", { name: "Tous les jeux", exact: true })
      .click();
    await expect(page).toHaveURL(/\/games$/);
    await page.getByRole("button", { name: "Plateau", exact: true }).click();
    await expect(page.locator(".discovery-card")).toHaveCount(2);
    await page.getByRole("button", { name: "Tous", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Rechercher un jeu" })
      .fill("inexistant");
    await expect(page.getByText("Aucun jeu trouvé.")).toBeVisible();
    await page.getByRole("button", { name: "Voir tous les jeux" }).click();
    await expect(page.locator(".discovery-card")).toHaveCount(5);
    await page.getByRole("link", { name: "Voir les tables" }).click();
    await expect(
      page.getByRole("heading", { name: "Trouvez votre table" }),
    ).toBeVisible();
    await expect(page.locator(".lobby-control-deck")).toBeHidden();
    await page
      .getByRole("button", { name: "Partie Rapide", exact: true })
      .click();
    await expect(page.locator(".lobby-control-deck")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `../reports/discovery-lobby-${width}.png`,
      fullPage: true,
    });
  });
}
