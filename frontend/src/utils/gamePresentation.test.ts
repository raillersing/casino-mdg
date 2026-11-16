import { describe, expect, it } from "vitest";
import {
  actionLabel,
  badgeForSeat,
  cardView,
  pokerPhaseLabel,
  tokenSubject,
} from "./gamePresentation";

describe("pure game presentation helpers", () => {
  it("preserves rank, suit, red color and unknown fallbacks", () => {
    expect(cardView({ rank: 14, suit: 2 })).toEqual({
      value: "A",
      suit: "♥",
      suitIndex: 2,
      red: true,
    });
    expect(cardView({ rank: 1, suit: 99 }).value).toBe("?");
    expect(cardView({ rank: 2, suit: 0 }).red).toBe(false);
  });

  it("derives badges from authoritative IDs without inventing roles", () => {
    const player = { id: "player-a" };
    expect(badgeForSeat(player, null)).toBe("");
    expect(
      badgeForSeat(player, {
        button_player_id: "player-a",
        small_blind_player_id: "player-b",
        big_blind_player_id: "player-a",
      }),
    ).toBe("D · BB");
  });

  it("keeps original action labels and unknown action fallback", () => {
    expect(pokerPhaseLabel("preflop")).toBe("Préflop");
    expect(actionLabel("call")).toBe("Suit");
    expect(actionLabel("street_changed", "flop")).toBe("Flop distribué");
    expect(actionLabel("street_changed", "showdown")).toBe("Showdown");
    expect(actionLabel("custom_action")).toBe("custom_action");
  });

  it("returns an empty token subject on absent or malformed JWTs", () => {
    expect(tokenSubject(null)).toBe("");
    expect(tokenSubject("not-a-jwt")).toBe("");
  });
});
