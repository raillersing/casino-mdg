import { expect, test, type Page } from "@playwright/test";

const table = {
  id: "table-emerald",
  table_code: "EMERALD-01",
  name: "Table Émeraude",
  game_type: "poker" as const,
  stakes: "50 / 100",
  max_players: 6,
  player_count: 2,
  status: "running" as const,
  is_private: false,
};

const tablesPayload = { results: [table] };

async function stubGameApis(page: Page) {
  await page.addInitScript(() => {
    const messages: string[] = [];
    class MockWebSocket {
      static OPEN = 1;
      static instances: MockWebSocket[] = [];
      id = MockWebSocket.instances.length;
      onopen: (() => void) | null = null;
      onclose: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: MessageEvent<string>) => void) | null = null;
      readyState = 0;
      joined = false;

      constructor(public url: string) {
        MockWebSocket.instances.push(this);
        window.setTimeout(() => {
          this.readyState = 1;
          this.onopen?.();
        }, 0);
      }

      send(message: string) {
        messages.push(message);
        try {
          const payload = JSON.parse(message) as {
            type?: string;
            table_id?: string;
          };
          if (payload.type === "join") {
            this.joined = true;
            localStorage.setItem("e2e_last_join_instance", String(this.id));
            this.onmessage?.(
              new MessageEvent("message", {
                data: JSON.stringify({
                  type: "state",
                  table_id: payload.table_id,
                  sequence: 4,
                  payload: {
                    table_id: payload.table_id,
                    game_type: "poker",
                    players: [
                      {
                        id: "e2e-user",
                        name: "Miora",
                        stack: 10000,
                        is_bot: false,
                      },
                      {
                        id: "poker-bot-1",
                        name: "IA Démo · Tovo",
                        stack: 10000,
                        is_bot: true,
                      },
                      {
                        id: "poker-bot-2",
                        name: "IA Démo · Rija",
                        stack: 10000,
                        is_bot: true,
                      },
                    ],
                    game_state: {
                      players: [],
                      community: [],
                      pot: 0,
                      current: 0,
                      phase: "preflop",
                    },
                  },
                }),
              }),
            );
            window.setTimeout(() => {
              this.onmessage?.(
                new MessageEvent("message", {
                  data: JSON.stringify({
                    type: "action",
                    action: "call",
                    player_id: "poker-bot-1",
                    sequence: 5,
                    payload: {
                      action: "call",
                      amount: 100,
                      phase: "preflop",
                      pot_after: 300,
                    },
                  }),
                }),
              );
              this.onmessage?.(
                new MessageEvent("message", {
                  data: JSON.stringify({
                    type: "action",
                    action: "street_changed",
                    sequence: 6,
                    payload: {
                      from: "preflop",
                      phase: "flop",
                      community: [
                        { rank: 14, suit: 3 },
                        { rank: 13, suit: 2 },
                        { rank: 10, suit: 1 },
                      ],
                      pot_after: 300,
                    },
                  }),
                }),
              );
              this.onmessage?.(
                new MessageEvent("message", {
                  data: JSON.stringify({
                    type: "action",
                    action: "showdown",
                    sequence: 7,
                    payload: {
                      winners: ["e2e-user"],
                      pot: 500,
                      revealed_cards: {
                        "e2e-user": [
                          { rank: 14, suit: 3 },
                          { rank: 14, suit: 2 },
                        ],
                      },
                    },
                  }),
                }),
              );
            }, 20);
          }
          if (payload.type === "leave")
            localStorage.setItem("e2e_last_leave", message);
        } catch {
          // Ignore malformed test messages; the in-memory log still captures them.
        }
      }

      close() {
        this.readyState = 3;
        this.onclose?.();
      }
    }
    Object.assign(window, {
      __wsMessages: messages,
      __wsInstances: MockWebSocket.instances,
    });
    Object.assign(window, { WebSocket: MockWebSocket });
  });
  await page.addInitScript(() => {
    localStorage.setItem("mdg_access_token", "e2e-token");
    localStorage.setItem("mdg_refresh_token", "e2e-refresh");
  });
  await page.route("**/api/v1/auth/me/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "e2e-user",
        display_name: "Miora",
        phone: "340000000",
        xp: 0,
        level: 1,
        is_staff: false,
      }),
    }),
  );
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(tablesPayload),
    }),
  );
  await page.route("**/api/v1/games/tables/table-emerald/join/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ table, created: false }),
    }),
  );
  await page.route("**/api/v1/games/bot-simulations/", (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        session_id: "session-1",
        table_id: "table-bot",
        table_code: "BOT-POKER-001",
        game_type: "poker",
        mode: "DEMO_AI",
        profile: "balanced",
        status: "running",
        bots: [
          {
            bot_key: "poker-bot-1",
            display_name: "IA Démo · Tovo",
            seat_index: 1,
            profile: "balanced",
            is_bot: true,
          },
          {
            bot_key: "poker-bot-2",
            display_name: "IA Démo · Rija",
            seat_index: 2,
            profile: "balanced",
            is_bot: true,
          },
          {
            bot_key: "poker-bot-3",
            display_name: "IA Démo · Saholy",
            seat_index: 3,
            profile: "balanced",
            is_bot: true,
          },
        ],
        created_at: "2026-08-13T10:00:00Z",
      }),
    }),
  );
  await page.route("**/api/v1/social/tables/**/chat/", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    }),
  );
}

async function expectCanonicalJoin(
  page: Page,
  expectedTableId = "table-emerald",
) {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const messages = (
            window as Window & { __wsMessages: string[] }
          ).__wsMessages.map(JSON.parse) as Array<{
            type?: string;
            table_id?: string;
          }>;
          const instances = (
            window as Window & {
              __wsInstances: Array<{
                readyState: number;
                id: number;
                joined: boolean;
              }>;
            }
          ).__wsInstances;
          const joins = messages.filter((message) => message.type === "join");
          return {
            activeSocketOpen: instances.at(-1)?.readyState === 1,
            activeSocketJoined: instances.at(-1)?.joined === true,
            latestJoin: joins.at(-1),
          };
        }),
      { timeout: 12_000 },
    )
    .toMatchObject({
      activeSocketOpen: true,
      activeSocketJoined: true,
      latestJoin: { type: "join", table_id: expectedTableId },
    });
}

test("expose spectator and demo AI journeys from the lobby", async ({
  page,
}) => {
  await stubGameApis(page);
  await page.goto("/lobby");

  await expect(page.getByRole("link", { name: /Regarder/i })).toHaveAttribute(
    "href",
    /mode=spectator/,
  );
  await expect(
    page.getByRole("button", { name: /Jeux de hasard/i }).last(),
  ).toBeVisible();

  await page.getByRole("link", { name: /Regarder/i }).click();
  await expect(page).toHaveURL(/mode=spectator/);
  await expect(page.getByText("Mode spectateur")).toBeVisible();
  await expect(page.getByText(/lecture seule/i).first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Se coucher|Vérifier|Miser/i }),
  ).toHaveCount(0);
});

test("starts a real declared demo AI session from the lobby", async ({
  page,
}) => {
  await stubGameApis(page);
  await page.goto("/lobby");
  await page.getByRole("button", { name: /Lancer une partie IA/i }).click();
  await expect(page).toHaveURL(/\/game\/poker\/BOT-POKER-001\?mode=demo_ai/);
  await expect(page.getByText("Démo contre l’IA")).toBeVisible();
  // The URL keeps the human-readable table code; the socket uses the
  // engine-owned table id returned by the simulation API.
  await expectCanonicalJoin(page, "table-bot");
  await expect(page.getByText(/IA Démo · Tovo/i).first()).toBeVisible();
  await expect(page.locator(".game-room")).toBeVisible();
});

test("shows bot actions with amount and pot in the live action log", async ({
  page,
}) => {
  await stubGameApis(page);
  await page.goto("/game/poker/EMERALD-01");
  await expect(page.getByText("IA Démo · Tovo").first()).toBeVisible();
  await expect(page.locator(".action-log")).toContainText("Suit");
  await expect(page.locator(".action-log")).toContainText("100");
  await expect(page.locator(".action-log")).toContainText("pot 300");
  await expect(page.locator(".action-log")).toContainText("Flop distribué");
  await expect(page.locator(".action-log")).toContainText("Showdown");
  await page.getByRole("button", { name: /Voir l’historique/i }).click();
  await expect(page.locator(".action-history")).toBeVisible();
  await expect(page.locator(".action-history")).toContainText(
    "Historique de la main",
  );
  await expect(page.locator(".action-history")).toContainText("Suit");
});

test("joins a table, sends leave, and returns to the lobby", async ({
  page,
}) => {
  await stubGameApis(page);
  await page.goto("/game/poker/EMERALD-01");
  await expectCanonicalJoin(page);
  await page.waitForTimeout(250);

  await page
    .getByRole("link", { name: /Quitter la table/i })
    .click({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/lobby$/, { timeout: 5_000 });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const messages = (
            window as Window & { __wsMessages: string[] }
          ).__wsMessages.map(JSON.parse) as Array<{ type?: string }>;
          return messages.filter((message) => message.type === "leave").length;
        }),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);
  const messages = await page.evaluate(() =>
    (window as Window & { __wsMessages: string[] }).__wsMessages.map(
      JSON.parse,
    ),
  );
  expect(messages.some((message) => message.type === "join")).toBeTruthy();
  const leaveMessage = JSON.parse(
    await page.evaluate(() => {
      const messages = (
        window as Window & { __wsMessages: string[] }
      ).__wsMessages.map(JSON.parse) as Array<{
        type?: string;
        table_id?: string;
      }>;
      return JSON.stringify(
        messages.findLast((message) => message.type === "leave"),
      );
    }),
  );
  expect(leaveMessage).toMatchObject({ type: "leave" });
  expect(leaveMessage.table_id).toBeTruthy();
});

test("reconnects the table socket after a transient disconnect", async ({
  page,
}) => {
  await stubGameApis(page);
  await page.goto("/game/poker/EMERALD-01");
  await expectCanonicalJoin(page);

  await page.evaluate(() => {
    const instances = (
      window as Window & { __wsInstances: Array<{ close: () => void }> }
    ).__wsInstances;
    instances.at(-1)?.close();
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as Window & { __wsInstances: unknown[] }).__wsInstances
              .length,
        ),
      { timeout: 12_000 },
    )
    .toBeGreaterThan(1);
  await expectCanonicalJoin(page);

  const messages = await page.evaluate(() =>
    (window as Window & { __wsMessages: string[] }).__wsMessages.map(
      JSON.parse,
    ),
  );
  expect(
    messages.filter((message) => message.type === "join").length,
  ).toBeGreaterThanOrEqual(2);
  expect(messages.some((message) => message.type === "sync")).toBeTruthy();
  expect(
    messages.filter((message) => message.type === "join").at(-1),
  ).toMatchObject({ sequence: 7 });
});
