import { expect, test, type Page } from "@playwright/test";

const mine = {
  id: "mine-id",
  table_code: "LUDO-MINE",
  name: "Ma partie Ludo",
  game_type: "ludo",
  stakes: "Gratuit",
  stake_amount: 0,
  max_players: 2,
  player_count: 2,
  status: "running",
  mode: "HUMAN_MATCH",
  is_private: false,
  joined: true,
};

async function signIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mdg_access_token", "v2-e2e-token");
    localStorage.setItem("mdg_refresh_token", "v2-e2e-refresh");
  });
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      json: {
        id: "player-v2",
        display_name: "Miora",
        phone: "340000000",
        level: 1,
        xp: 0,
        is_staff: false,
      },
    }),
  );
  await page.route("**/api/v1/wallet/balance/", (route) =>
    route.fulfill({
      json: { balance: 0, held_balance: 0, mga_balance: 0, mga_held_balance: 0 },
    }),
  );
}

test("mobile navigation puts games and my parties within one tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const nav = page.locator(".bottom-nav");
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link")).toHaveCount(4);
  await nav.getByRole("link", { name: "Jeux", exact: true }).click();
  await expect(page).toHaveURL(/\/games$/);
  await nav.getByRole("link", { name: "Mes parties" }).click();
  await expect(page).toHaveURL(/\/mes-parties$/);
  await expect(page.getByRole("heading", { name: "Mes parties" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Se connecter" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("home offers a clear public-games path and does not show false activity", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Une partie, ensemble ?" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Choisir un jeu/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Créer une table/i })).toBeVisible();
  await expect(page.locator(".live-activity-totals")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test("my parties distinguishes engine-confirmed games from reserved seats", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      json: { results: [mine, { ...mine, id: "waiting-id", name: "Table en attente", table_code: "LUDO-WAIT", status: "open" }] },
    }),
  );
  await page.route("**/api/v1/games/resumable/", (route) =>
    route.fulfill({ json: { results: [mine] } }),
  );
  await page.goto("/mes-parties");
  const live = page.getByRole("region", { name: /Parties en cours confirmées/i });
  await expect(live.getByText("Ma partie Ludo")).toBeVisible();
  const waiting = page.getByRole("region", { name: /Mes autres tables/i });
  await expect(waiting.getByText("Table en attente")).toBeVisible();
  await expect(waiting.getByText("Ma partie Ludo")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Reprendre la partie/i }))
    .toHaveAttribute("href", /\/game\/ludo\/LUDO-MINE/);
});

test("the catalog preserves create intent for the selected game", async ({ page }) => {
  await signIn(page);
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({ json: { games: { belote: { players: [4], defaults: { target_score: 1001 } } } } }),
  );
  await page.goto("/games?intent=create");
  await expect(page.getByRole("heading", { name: "Pour quel jeu créer une table ?" })).toBeVisible();
  await page.locator(".discovery-card").first().click();
  await expect(page).toHaveURL(/\/lobby\/belote/);
  await expect(page.getByRole("dialog", { name: /Créer une table de BELOTE/ })).toBeVisible();
});

test("the catalog offers a direct practice action for the selected game", async ({ page }) => {
  await page.goto("/games?intent=practice");
  await expect(
    page.getByRole("heading", { name: "À quel jeu voulez-vous vous entraîner ?" }),
  ).toBeVisible();
  await expect(page.locator(".discovery-card-button")).toHaveCount(5);
});


for (const game of ["belote", "domino", "ludo", "rami", "poker"] as const) {
  test(`game-first actions are available directly on mobile for ${game}`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.route("**/api/v1/games/tables/**", (route) =>
      route.fulfill({ json: { results: [] } }),
    );
    await page.goto(`/lobby/${game}`);
    await expect(page.getByRole("button", { name: /Trouver des joueurs pour/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Créer une table" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "J'ai un code" }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tables disponibles" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
