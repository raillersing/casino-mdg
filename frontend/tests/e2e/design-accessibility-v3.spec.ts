import { expect, test } from "@playwright/test";

test("mobile navigation names its games tab in Malagasy", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".language-toggle").click();
  const nav = page.locator(".bottom-nav");
  await expect(nav.getByRole("link", { name: "Lalao" })).toBeVisible();
  await nav.getByRole("link", { name: "Lalao" }).click();
  await expect(page).toHaveURL(/\/games$/);
});

test("primary lobby actions expose keyboard focus and 44px targets", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/lobby/ludo");
  const play = page.locator(".game-lobby-find");
  await expect(play).toBeVisible();
  await play.focus();
  const style = await play.evaluate((element) => {
    const computed = getComputedStyle(element);
    return { outline: computed.outlineStyle, height: element.getBoundingClientRect().height };
  });
  expect(style.outline).not.toBe("none");
  expect(style.height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});
