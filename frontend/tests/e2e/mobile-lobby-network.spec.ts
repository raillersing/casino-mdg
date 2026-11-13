import { expect, test } from "@playwright/test";

test("lobby tables poll after fifteen seconds and refresh on foreground", async ({
  page,
}) => {
  await page.clock.install();
  let tableRequests = 0;
  await page.route("**/api/v1/games/tables/**", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    tableRequests += 1;
    return route.fulfill({ json: { results: [] } });
  });
  await page.route("**/api/v1/games/live-stats/", (route) =>
    route.fulfill({ json: { games: {} } }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/lobby/ludo");
  await expect(
    page.getByRole("heading", { name: "Tables disponibles" }),
  ).toBeVisible();
  await expect.poll(() => tableRequests).toBe(1);

  await page.clock.fastForward(5000);
  await expect.poll(() => tableRequests).toBe(1);
  await page.clock.fastForward(10000);
  await expect.poll(() => tableRequests).toBe(2);

  await page.evaluate(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => tableRequests).toBe(3);
});

test("lobby initial data refresh does not duplicate its live-stat request", async ({
  page,
}) => {
  await page.clock.install();
  let liveStatsRequests = 0;
  await page.route("**/api/v1/games/tables/**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("**/api/v1/games/live-stats/", (route) => {
    liveStatsRequests += 1;
    return route.fulfill({ json: { games: {} } });
  });
  await page.goto("/lobby/ludo");
  await expect(
    page.getByRole("heading", { name: "Tables disponibles" }),
  ).toBeVisible();
  await expect.poll(() => liveStatsRequests).toBe(1);

  await page.clock.fastForward(15000);
  await expect.poll(() => liveStatsRequests).toBe(1);
  await page.clock.fastForward(15000);
  await expect.poll(() => liveStatsRequests).toBe(2);
});
