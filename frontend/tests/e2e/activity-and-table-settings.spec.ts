import { expect, test } from "@playwright/test";

const games = ["belote", "poker", "rami", "ludo", "domino"];

test("unique audience periods remain distinct from current activity", async ({
  page,
}) => {
  await page.route("**/api/v1/games/player-statistics/", (route) =>
    route.fulfill({
      json: {
        games: Object.fromEntries(
          games.map((game) => [
            game,
            {
              unique_players_1d: 2,
              unique_players_7d: 7,
              unique_players_30d: 19,
              unique_players_365d: 45,
            },
          ]),
        ),
        coverage_started_at: new Date().toISOString(),
        as_of: new Date().toISOString(),
      },
    }),
  );
  await page.route("**/api/v1/games/live-stats/", (route) =>
    route.fulfill({
      json: {
        running_tables_verified: true,
        total_online_players: 5,
        total_in_game_players: 4,
        total_running_tables: 1,
        games: Object.fromEntries(
          games.map((game) => [
            game,
            {
              name: game,
              in_game_players: 4,
              online_players: 4,
              running_tables: 1,
              open_tables: 2,
              total_tables: 3,
            },
          ]),
        ),
        updated_at: new Date().toISOString(),
      },
    }),
  );
  await page.goto("/play/belote");
  const audience = page.getByRole("region", {
    name: "Joueurs uniques",
    exact: true,
  });
  await expect(audience.getByRole("status")).toContainText("7 joueurs uniques");
  await audience.getByLabel("Période").selectOption("30");
  await expect(audience.getByRole("status")).toContainText(
    "19 joueurs uniques",
  );
  await audience.getByLabel("Période").selectOption("365");
  await expect(audience.getByRole("status")).toContainText(
    "45 joueurs uniques",
  );
  await expect(audience).toContainText("Historique partiel");
  await expect(page.locator(".game-activity-summary")).toContainText(
    "4 en partie",
  );
  await expect(page.locator(".game-activity-summary")).toContainText(
    "1 tables publiques en cours",
  );
});

test("unavailable live activity does not show a false zero", async ({
  page,
}) => {
  await page.route("**/api/v1/games/live-stats/", (route) =>
    route.fulfill({ status: 503, json: { available: false } }),
  );
  await page.goto("/");
  // The redesigned home intentionally does not display unverified activity.
  await expect(page.locator(".live-activity-totals")).toHaveCount(0);
  const playLink = page.getByRole("link", { name: "Jouer en ligne" });
  await expect(playLink).toBeVisible();
  await expect(playLink).toHaveAttribute("href", "/games?intent=matchmaking");
});

test("table creation exposes only server-supported game settings", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("mdg_access_token", "qa-fixture"),
  );
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      json: { id: "qa-user", display_name: "QA", xp: 0, level: 1 },
    }),
  );
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: {
        games: {
          belote: {
            players: [4],
            rules: { target_score: [501, 1001] },
            defaults: { target_score: 1001 },
            summary: "Quatre joueurs en équipes",
          },
          poker: {
            players: [2, 6, 9],
            rules: { small_blind: [25, 50, 100] },
            defaults: { small_blind: 50 },
            summary: "Texas Hold’em",
          },
        },
      },
    }),
  );
  await page.goto("/lobby?action=create&game_type=belote");
  const dialog = page.getByRole("dialog", {
    name: "Créer une table",
    exact: true,
  });
  await expect(
    dialog.getByLabel("Joueurs", { exact: true }).locator("option"),
  ).toHaveCount(1);
  await expect(dialog.getByLabel("Score à atteindre")).toHaveValue("1001");
  await dialog.getByLabel("Jeu", { exact: true }).selectOption("poker");
  await expect(
    dialog.getByLabel("Joueurs", { exact: true }).locator("option"),
  ).toHaveCount(3);
  await expect(dialog.getByLabel("Petite blind", { exact: false })).toHaveValue(
    "50",
  );
  await expect(dialog.getByLabel("Score à atteindre")).toHaveCount(0);
  await expect(
    dialog.getByText("Jetons de jeu uniquement", { exact: false }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
