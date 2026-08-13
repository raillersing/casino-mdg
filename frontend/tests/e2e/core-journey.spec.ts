import { expect, test } from "@playwright/test";

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

test("navigates from home to the lobby and sees an available table", async ({
  page,
}) => {
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tablesPayload),
    }),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Le jeu a une/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Entrer dans le lobby/i }).click();

  await expect(page).toHaveURL(/\/lobby$/);
  await expect(page.getByText("Table Émeraude")).toBeVisible();
  await expect(page.locator(".table-main > span")).toHaveText(
    "Poker Texas Hold'em",
  );
});

test("completes the local OTP onboarding journey", async ({ page }) => {
  await page.route("**/api/v1/auth/otp/request/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        request_id: "request-1",
        expires_in: 300,
        dev_code: "123456",
      }),
    }),
  );
  await page.route("**/api/v1/auth/otp/verify/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access: "access-token",
        refresh: "refresh-token",
        user: {
          id: "user-1",
          display_name: "Miora",
          phone: "340000000",
          xp: 0,
          level: 1,
        },
        wallet: { balance: 10_000, currency: "MDG" },
      }),
    }),
  );

  await page.goto("/auth");
  await page.locator(".phone-field input").fill("340000000");
  await page.getByRole("button", { name: /Recevoir mon code/i }).click();
  await expect(page.locator(".auth-code-field")).toBeVisible();
  await page.locator(".auth-code-field").fill("123456");
  await page.locator(".auth-name-field").fill("Miora");
  await page.getByRole("button", { name: /Entrer dans le club/i }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Miora")).toBeVisible();
  await expect(
    page.evaluate(() => localStorage.getItem("mdg_access_token")),
  ).resolves.toBe("access-token");
});

test("switches the core home screen to Malagasy", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Changer de langue" }).click();
  await expect(
    page.getByRole("heading", { name: /Manana adiresy/i }),
  ).toBeVisible();
  await expect(page.getByText("Hiditra amin'ny lobby")).toBeVisible();
});

test("switches the lobby journey to Malagasy", async ({ page }) => {
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tablesPayload),
    }),
  );
  await page.goto("/lobby");
  await page.getByRole("button", { name: "Changer de langue" }).click();
  await expect(page.getByText("Misafidiana latabatra")).toBeVisible();
  await expect(page.getByText("Misokatra", { exact: true })).toBeVisible();
});

test("opens an auditable wallet transaction from history", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("mdg_access_token", "wallet-token");
    localStorage.setItem("mdg_refresh_token", "wallet-refresh");
  });
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "wallet-user",
        display_name: "Miora",
        phone: "340000000",
        xp: 0,
        level: 1,
        is_staff: false,
      }),
    }),
  );
  await page.route("**/api/v1/wallet/balance/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        account_id: 1,
        balance: 10000,
        held_balance: 0,
        currency: "SIM",
      }),
    }),
  );
  await page.route("**/api/v1/wallet/transactions/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        count: 1,
        next_offset: null,
        results: [
          {
            id: "transaction-1",
            type: "bonus",
            direction: "credit",
            amount: 10000,
            currency: "SIM",
            status: "completed",
            description: "Bonus de bienvenue MDG Game Club",
            created_at: "2026-08-11T12:00:00Z",
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/wallet/transactions/transaction-1/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "transaction-1",
        transaction_code: "SIM-BONUS-1",
        type: "bonus",
        direction: "credit",
        amount: 10000,
        currency: "SIM",
        status: "completed",
        description: "Bonus de bienvenue MDG Game Club",
        created_at: "2026-08-11T12:00:00Z",
        processed_at: "2026-08-11T12:00:00Z",
        metadata: {},
        entries: [
          {
            account_type: "platform",
            entry_type: "debit",
            amount: 10000,
            balance_after: -10000,
          },
          {
            account_type: "player",
            entry_type: "credit",
            amount: 10000,
            balance_after: 10000,
          },
        ],
      }),
    }),
  );
  await page.route("**/api/v1/payments/intents/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    }),
  );

  await page.goto("/wallet");
  await page.getByRole("button", { name: "Historique" }).click();
  await page.getByRole("button", { name: /Bonus de bienvenue/i }).click();

  await expect(page.getByText("Détail de la transaction")).toBeVisible();
  await expect(page.getByText("SIM-BONUS-1")).toBeVisible();
  await expect(page.getByText("Compte platform")).toBeVisible();
  await expect(page.getByText("Compte player")).toBeVisible();
});

test("claims a completed daily mission from the profile", async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("mdg_access_token", "mission-token"),
  );
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mission-user",
        display_name: "Miora",
        phone: "340000000",
        xp: 0,
        level: 1,
        is_staff: false,
      }),
    }),
  );
  await page.route("**/api/v1/games/results/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stats: { played: 1, wins: 1, losses: 0, draws: 0, total_won: 100 },
      }),
    }),
  );
  await page.route("**/api/v1/games/leaderboard/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    }),
  );
  await page.route("**/api/v1/kyc/status/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        level: "discovered",
        limits_mga: { deposit: 100000, withdrawal: 0 },
        request: null,
        documents_enabled: false,
      }),
    }),
  );
  await page.route("**/api/v1/games/missions/", (route) => {
    if (route.request().method() === "POST")
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          claimed: true,
          duplicate: false,
          transaction_id: "reward-1",
        }),
      });
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-08-11",
        missions: [
          {
            key: "play_daily",
            title: "Jouer aujourd’hui",
            progress: 1,
            goal: 1,
            reward: 100,
            claimed: false,
            claimable: true,
          },
          {
            key: "win_daily",
            title: "Gagner aujourd’hui",
            progress: 1,
            goal: 1,
            reward: 250,
            claimed: false,
            claimable: true,
          },
        ],
      }),
    });
  });

  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Missions du jour" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Réclamer" }).first().click();
  await expect(page.getByText("Réclamée").first()).toBeVisible();
});
