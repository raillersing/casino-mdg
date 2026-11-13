import { expect, test, type Page } from "@playwright/test";

const ludoTables = [
  {
    id: "full",
    table_code: "LUDO-FULL",
    name: "Table complète",
    game_type: "ludo",
    stakes: "Gratuit",
    stake_amount: 0,
    max_players: 2,
    player_count: 2,
    status: "open",
    mode: "HUMAN_MATCH",
    is_private: false,
  },
  {
    id: "open",
    table_code: "LUDO-OPEN",
    name: "Table ouverte",
    game_type: "ludo",
    stakes: "Gratuit",
    stake_amount: 0,
    max_players: 2,
    player_count: 1,
    status: "open",
    mode: "HUMAN_MATCH",
    is_private: false,
  },
  {
    id: "mine",
    table_code: "LUDO-MINE",
    name: "Ma partie",
    game_type: "ludo",
    stakes: "Gratuit",
    stake_amount: 0,
    max_players: 2,
    player_count: 2,
    status: "running",
    mode: "HUMAN_MATCH",
    is_private: false,
    joined: true,
  },
];

async function mockTableList(page: Page, tables = ludoTables) {
  await page.route("**/api/v1/games/tables/**", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ json: { results: tables } });
    }
    return route.continue();
  });
}

async function mockSignedIn(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mdg_access_token", "test-ludo-token");
    localStorage.setItem("mdg_refresh_token", "test-ludo-refresh");
  });
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      json: {
        id: "ludo-user",
        display_name: "Miora",
        phone: "340000000",
        xp: 0,
        level: 1,
        is_staff: false,
      },
    }),
  );
  await page.route("**/api/v1/wallet/balance/", (route) =>
    route.fulfill({
      json: {
        balance: 0,
        held_balance: 0,
        mga_balance: 0,
        mga_held_balance: 0,
      },
    }),
  );
}

for (const width of [320, 390, 1440]) {
  test(`Ludo lobby shows relevant actions and joinable tables at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockTableList(page);
    await page.goto("/lobby/ludo");

    await expect(
      page.getByRole("button", { name: /Trouver des joueurs pour Ludo/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Tables disponibles" }),
    ).toBeVisible();
    await expect(page.locator(".game-lobby-table-card")).toHaveCount(3);
    await expect(page.locator(".game-lobby-table-card h3").first()).toHaveText(
      "Ma partie",
    );
    await expect(page.locator(".game-lobby-table-card h3").nth(1)).toHaveText(
      "Table ouverte",
    );
    await expect(
      page.getByRole("button", { name: "Rejoindre Table ouverte" }),
    ).toBeEnabled();
    await expect(
      page.getByRole("button", { name: "Rejoindre Table complète" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Reprendre Ma partie" }),
    ).toBeEnabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("mobile table creation uses the game and server-defined capacities", async ({
  page,
}) => {
  await mockSignedIn(page);
  const sent: Record<string, unknown>[] = [];
  await page.route("**/api/v1/games/tables/**", (route) => {
    if (route.request().method() !== "POST") {
      return route.fulfill({ json: { results: [] } });
    }
    const request = route.request().postDataJSON() as Record<string, unknown>;
    sent.push(request);
    return route.fulfill({
      json: {
        table: {
          id: "created-ludo",
          table_code: "LUDO-CREATED",
          name: request.name,
          game_type: "ludo",
          max_players: request.max_players,
          player_count: 1,
          status: "open",
          is_private: request.is_private,
          mode: "HUMAN_MATCH",
        },
        table_id: "created-ludo",
        admission_token: "admission-test",
        created: true,
      },
    });
  });
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: {
        games: {
          ludo: {
            players: [2, 3, 4],
            defaults: {},
          },
        },
      },
    }),
  );

  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/lobby/ludo");
  await page.getByRole("button", { name: "Créer une table" }).first().click();
  const dialog = page.getByRole("dialog", { name: /Créer une table de LUDO/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "3", exact: true }).click();
  await dialog.getByRole("button", { name: "Sur invitation" }).click();
  await dialog.getByRole("button", { name: "Créer et rejoindre" }).click();

  await expect(page).toHaveURL(/\/game\/ludo\/LUDO-CREATED/);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({
    game_type: "ludo",
    max_players: 3,
    is_private: true,
    stake_amount: 0,
    turn_duration: 30,
    rules_config: {},
  });
  expect(typeof sent[0].idempotency_key).toBe("string");
});

test("matchmaking remains tied to the selected game and can be cancelled", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  const queuedGames: string[] = [];
  const cancelled: string[] = [];
  const ticket = {
    ticket_id: "ludo-ticket",
    game_type: "ludo",
    table_id: null,
    table_code: null,
    status: "queued",
    created_at: new Date().toISOString(),
    waiting_seconds: 0,
    timeout_seconds: 60,
  };

  await page.route("**/api/v1/games/matchmaking/**", (route) => {
    const url = route.request().url();
    if (
      url.includes("matchmaking/queue/") &&
      route.request().method() === "POST"
    ) {
      const body = route.request().postDataJSON() as { game_type: string };
      queuedGames.push(body.game_type);
      return route.fulfill({ json: { ticket, created: true } });
    }
    if (
      url.includes("matchmaking/queue/ludo-ticket/") &&
      route.request().method() === "DELETE"
    ) {
      cancelled.push("ludo-ticket");
      return route.fulfill({
        json: { ticket: { ...ticket, status: "cancelled" } },
      });
    }
    if (url.includes("matchmaking/status/")) {
      return route.fulfill({
        json: {
          game_type: "ludo",
          human_online: 0,
          queued: 1,
          estimated_wait_seconds: 0,
          timeout_seconds: 60,
          ticket: null,
        },
      });
    }
    return route.fulfill({ json: { status: "online", game_type: "ludo" } });
  });

  await page.goto("/lobby/ludo");
  await page
    .getByRole("button", { name: /Trouver des joueurs pour Ludo/i })
    .click();
  await expect(page.getByText("Recherche en cours")).toBeVisible();
  expect(queuedGames).toEqual(["ludo"]);
  await page
    .locator(".game-lobby-searching")
    .getByRole("button", { name: "Annuler" })
    .click();
  await expect(
    page.getByRole("button", { name: /Trouver des joueurs pour Ludo/i }),
  ).toBeVisible();
  expect(cancelled).toEqual(["ludo-ticket"]);
});

test("the chosen game and quick-create intent survive authentication", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: { games: { ludo: { players: [2, 3, 4], defaults: {} } } },
    }),
  );
  await page.goto("/lobby/ludo?action=create");
  const dialog = page.getByRole("dialog", { name: /Créer une table de LUDO/ });
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(/action=create/);
  await dialog.getByRole("button", { name: "Fermer" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/lobby\/ludo$/);
});

test("returning from authentication can resume Ludo matchmaking", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  const queued: string[] = [];
  const ticket = {
    ticket_id: "resume-ludo",
    game_type: "ludo",
    table_id: null,
    table_code: null,
    status: "queued",
    created_at: new Date().toISOString(),
    waiting_seconds: 0,
    timeout_seconds: 60,
  };
  await page.route("**/api/v1/games/matchmaking/**", (route) => {
    const url = route.request().url();
    if (url.includes("queue/") && route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { game_type: string };
      queued.push(body.game_type);
      return route.fulfill({ json: { ticket, created: true } });
    }
    if (url.includes("status/")) {
      return route.fulfill({
        json: {
          game_type: "ludo",
          human_online: 0,
          queued: 0,
          estimated_wait_seconds: 0,
          ticket: queued.length ? ticket : null,
        },
      });
    }
    return route.fulfill({ json: { status: "online", game_type: "ludo" } });
  });
  await page.goto("/lobby/ludo?action=matchmaking");
  await expect(page.getByText("Recherche en cours")).toBeVisible();
  expect(queued).toEqual(["ludo"]);
  await expect(page).not.toHaveURL(/action=matchmaking/);
});

test("per-game filters distinguish free seats and my reserved table", async ({
  page,
}) => {
  await mockTableList(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lobby/ludo");
  await expect(page.locator(".game-lobby-table-card")).toHaveCount(3);
  await page.getByLabel("Disponibilité").selectOption("available");
  await expect(page.locator(".game-lobby-table-card")).toHaveCount(2);
  await page.getByLabel("Disponibilité").selectOption("mine");
  await expect(page.locator(".game-lobby-table-card")).toHaveCount(1);
  await expect(page.locator(".game-lobby-table-card")).toContainText(
    "Ma partie",
  );
  await page.getByLabel("Disponibilité").selectOption("all");
  await page
    .getByRole("searchbox", { name: "Rechercher une table" })
    .fill("ouverte");
  await expect(page.locator(".game-lobby-table-card")).toHaveCount(1);
  await expect(page.locator(".game-lobby-table-card")).toContainText(
    "Table ouverte",
  );
});

test("reload shows a deliberate resume action for an already matched player", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: { games: { ludo: { players: [2, 3, 4], defaults: {} } } },
    }),
  );
  await page.route("**/api/v1/games/matchmaking/heartbeat/", (route) =>
    route.fulfill({ json: { status: "online", game_type: "ludo" } }),
  );
  await page.route("**/api/v1/games/matchmaking/status/**", (route) =>
    route.fulfill({
      json: {
        game_type: "ludo",
        human_online: 2,
        queued: 0,
        estimated_wait_seconds: null,
        timeout_seconds: null,
        ticket: {
          ticket_id: "persisted-match",
          game_type: "ludo",
          status: "matched",
          target_players: 2,
          table_code: "LUDO-FOUND",
          table_id: "matched-room-id",
          created_at: new Date().toISOString(),
          waiting_seconds: 0,
          timeout_seconds: null,
        },
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto("/lobby/ludo");
  const resume = page.getByRole("link", {
    name: "Rejoindre ma partie",
    exact: true,
  });
  await expect(resume).toBeVisible();
  await expect(page).toHaveURL(/\/lobby\/ludo/);
  await expect(resume).toHaveAttribute(
    "href",
    "/game/ludo/LUDO-FOUND?table_id=matched-room-id",
  );
  await resume.click();
  await expect(page).toHaveURL(/\/game\/ludo\/LUDO-FOUND/);
});

test("long-running matchmaking remains cancellable without a fictitious timeout", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: { games: { ludo: { players: [2, 3, 4], defaults: {} } } },
    }),
  );
  await page.route("**/api/v1/games/matchmaking/heartbeat/", (route) =>
    route.fulfill({ json: { status: "searching", game_type: "ludo" } }),
  );
  await page.route("**/api/v1/games/matchmaking/status/**", (route) =>
    route.fulfill({
      json: {
        game_type: "ludo",
        human_online: 1,
        queued: 1,
        estimated_wait_seconds: null,
        timeout_seconds: null,
        ticket: {
          ticket_id: "still-waiting",
          game_type: "ludo",
          status: "queued",
          target_players: 2,
          table_id: null,
          table_code: null,
          created_at: new Date(Date.now() - 25_000).toISOString(),
          waiting_seconds: 25,
          timeout_seconds: null,
        },
      },
    }),
  );
  await page.goto("/lobby/ludo");
  await expect(page.getByText("Recherche en cours")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Annuler", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Temps écoulé.*2[5-9]s/)).toBeVisible();
  await expect(page.getByText(/Délai dépassé/)).toHaveCount(0);
});

test("cancel versus match race preserves access to an already assigned table", async ({
  page,
}) => {
  await mockSignedIn(page);
  await mockTableList(page, []);
  await page.route("**/api/v1/games/table-capabilities/", (route) =>
    route.fulfill({
      json: { games: { ludo: { players: [2, 3, 4], defaults: {} } } },
    }),
  );
  await page.route("**/api/v1/games/matchmaking/heartbeat/", (route) =>
    route.fulfill({ json: { status: "searching", game_type: "ludo" } }),
  );
  const ticket = {
    ticket_id: "race-ticket",
    game_type: "ludo",
    target_players: 2,
    table_id: null,
    table_code: null,
    status: "queued",
    created_at: new Date().toISOString(),
    waiting_seconds: 0,
    timeout_seconds: null,
  };
  await page.route("**/api/v1/games/matchmaking/status/**", (route) =>
    route.fulfill({
      json: {
        game_type: "ludo",
        human_online: 2,
        queued: 1,
        estimated_wait_seconds: null,
        timeout_seconds: null,
        ticket,
      },
    }),
  );
  await page.route("**/api/v1/games/matchmaking/queue/race-ticket/", (route) =>
    route.fulfill({
      json: {
        ticket: {
          ...ticket,
          status: "matched",
          table_id: "allocated-table",
          table_code: "LUDO-ALLOCATED",
        },
      },
    }),
  );
  await page.goto("/lobby/ludo");
  await expect(page.locator(".game-lobby-cancel")).toBeVisible();
  await page.locator(".game-lobby-cancel").click();
  await expect(
    page.getByText(/La partie a été trouvée avant l'annulation/),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Rejoindre ma partie" }),
  ).toHaveAttribute(
    "href",
    "/game/ludo/LUDO-ALLOCATED?table_id=allocated-table",
  );
  await expect(page).toHaveURL(/\/lobby\/ludo/);
});
