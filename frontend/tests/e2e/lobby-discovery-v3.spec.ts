import { expect, test } from "@playwright/test";

const base = {
  table_code: "LUDO-OPEN",
  name: "Ludo public",
  game_type: "ludo",
  stakes: "Gratuit",
  stake_amount: 0,
  max_players: 4,
  player_count: 1,
  mode: "HUMAN_MATCH",
  status: "open",
  is_private: false,
  joined: false,
  club_id: null,
  club_name: null,
};

test("game lobby offers honest actions when no table is available", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.goto("/lobby/ludo");
  const empty = page.locator(".lobby-empty-v3");
  await expect(empty.getByText("Aucune table disponible pour le moment.")).toBeVisible();
  await expect(empty.getByRole("button", { name: "Trouver des joueurs" })).toBeVisible();
  await expect(empty.getByRole("button", { name: "Créer une table" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
});

test("table loading error is not misrepresented as zero availability", async ({ page }) => {
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ status: 503, json: { detail: "Service unavailable" } }),
  );
  await page.goto("/lobby/ludo");
  const empty = page.locator(".lobby-empty-v3");
  await expect(empty).toHaveAttribute("role", "alert");
  await expect(empty.getByText("Impossible de charger les tables.")).toBeVisible();
  await expect(empty.getByRole("button", { name: "Réessayer" })).toBeVisible();
});

test("admission is offered for public tables with free seats, subject to server approval", async ({ page }) => {
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      json: {
        results: [
          { ...base, id: "open", name: "Table ouverte" },
          { ...base, id: "running", name: "Partie commencée", status: "running" },
          { ...base, id: "private", name: "Table privée", is_private: true },
          { ...base, id: "full", name: "Table complète", player_count: 4 },
        ],
      },
    }),
  );
  await page.goto("/lobby/ludo");
  const cards = page.locator(".game-lobby-table-card");
  await expect(cards).toHaveCount(4);
  await expect(cards.filter({ hasText: "Table ouverte" }).getByRole("button"))
    .toBeEnabled();
  await expect(cards.filter({ hasText: "Partie commencée" }).getByRole("button"))
    .toBeEnabled();
  await expect(cards.filter({ hasText: "Table privée" }).getByRole("button"))
    .toBeDisabled();
  await expect(cards.filter({ hasText: "Table complète" }).getByRole("button"))
    .toBeDisabled();
});
