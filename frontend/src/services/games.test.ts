import { afterEach, describe, expect, it, vi } from "vitest";
import { recordGameResult } from "@services/games";

describe("recordGameResult", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the engine signature with the result contract", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          created: true,
          outcome: "win",
          transaction_id: "tx-1",
        }),
        { status: 201 },
      ),
    );

    await recordGameResult("token-1", "game-1", "poker", "win", 250, "sig-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/games/results/",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
          "X-Game-Engine-Signature": "sig-1",
        }),
        body: JSON.stringify({
          game_id: "game-1",
          game_type: "poker",
          outcome: "win",
          amount: 250,
        }),
      }),
    );
  });

  it("surfaces backend rejection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: "signature invalide" }), {
        status: 403,
      }),
    );
    await expect(
      recordGameResult("token-1", "game-1", "poker", "win", 250, "bad"),
    ).rejects.toThrow("signature invalide");
  });
});
