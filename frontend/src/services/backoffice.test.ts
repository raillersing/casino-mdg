import { afterEach, describe, expect, it, vi } from "vitest";
import { getLiveDashboard, setFeatureFlag } from "@services/backoffice";

describe("backoffice live dashboard service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches the staff-only live dashboard with window days", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          generated_at: "2026-10-25T12:00:00Z",
          window_days: 7,
          games_stats: { overview: { tables_running: 3 } },
          application_stats: {
            concurrency_and_capacity: { production_readiness_score: 64 },
          },
          player_flow: { realtime_presence: { online_30s: 12 } },
        }),
        { status: 200 },
      ),
    );

    const result = await getLiveDashboard("staff-token", 7);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/backoffice/live-dashboard/?days=7",
      expect.objectContaining({
        headers: { Authorization: "Bearer staff-token" },
      }),
    );
    expect(result.window_days).toBe(7);
  });

  it("rejects non-staff access with 403 error detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          detail: "Vous n'avez pas la permission d'effectuer cette action.",
        }),
        { status: 403 },
      ),
    );

    await expect(getLiveDashboard("player-token", 7)).rejects.toThrow(
      "Vous n'avez pas la permission",
    );
  });

  it("submits feature flag update with TOTP and optimistic lock", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          key: "game_results",
          enabled: false,
          reason: "Maintenance NOC",
          updated_at: "2026-10-25T12:00:00Z",
        }),
        { status: 200 },
      ),
    );

    const updated = await setFeatureFlag(
      "admin-token",
      "game_results",
      false,
      "Maintenance NOC",
      "123456",
      "2026-10-25T12:00:00Z",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/backoffice/feature-flags/",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer admin-token",
        },
        body: JSON.stringify({
          key: "game_results",
          enabled: false,
          reason: "Maintenance NOC",
          mfa_code: "123456",
          expected_updated_at: "2026-10-25T12:00:00Z",
        }),
      }),
    );
    expect(updated.enabled).toBe(false);
  });
});
