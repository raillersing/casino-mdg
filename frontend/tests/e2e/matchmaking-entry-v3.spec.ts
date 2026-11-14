import { expect, test } from "@playwright/test";

test("rapid taps submit only one matchmaking queue request", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mdg_access_token", "queue-dedupe-token");
    localStorage.setItem("mdg_refresh_token", "queue-dedupe-refresh");
  });
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      json: {
        id: "player-queue",
        display_name: "Miora",
        phone: "340000000",
        level: 1,
        xp: 0,
        is_staff: false,
      },
    }),
  );
  await page.route("**/api/v1/wallet/balance/", (route) =>
    route.fulfill({ json: { balance: 0, held_balance: 0, mga_balance: 0, mga_held_balance: 0 } }),
  );
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({ json: { games: { ludo: { players: [2, 4], defaults: {} } } } }),
  );
  await page.route("**/api/v1/games/matchmaking/status/**", (route) =>
    route.fulfill({ json: { human_online: 0, estimated_wait_seconds: null, ticket: null } }),
  );
  await page.route("**/api/v1/games/matchmaking/heartbeat/", (route) =>
    route.fulfill({ json: { status: "online", game_type: "ludo" } }),
  );

  let calls = 0;
  let release: (() => void) | undefined;
  await page.route("**/api/v1/games/matchmaking/queue/", async (route) => {
    calls += 1;
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      json: {
        ticket: {
          id: "ludo-pending",
          ticket_id: "ludo-pending",
          game_type: "ludo",
          status: "queued",
          target_players: 2,
          created_at: new Date().toISOString(),
        },
        created: true,
      },
    });
  });

  await page.goto("/lobby/ludo");
  const search = page.getByRole("button", { name: /Trouver des joueurs pour Ludo/i });
  await search.click();
  await expect(search).toBeDisabled();
  await expect(search.getByText("Lancement de la recherche…")).toBeVisible();
  expect(calls).toBe(1);
  release?.();
  await expect(page.locator(".game-lobby-searching")).toBeVisible();
  expect(calls).toBe(1);
});
