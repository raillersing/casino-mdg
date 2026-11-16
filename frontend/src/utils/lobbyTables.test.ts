import { describe, expect, it } from "vitest";
import type { GameTable } from "@services/games";
import { countActiveLobbyTables, selectLobbyTables } from "./lobbyTables";

function makeTable(overrides: Partial<GameTable> = {}): GameTable {
  return {
    id: "table-1",
    table_code: "TABLE-001",
    name: "Table conviviale",
    game_type: "belote",
    stakes: "Gratuit",
    stake_amount: 0,
    max_players: 4,
    player_count: 1,
    status: "open",
    mode: "HUMAN_MATCH",
    is_private: false,
    joined: false,
    club_id: null,
    club_name: null,
    ...overrides,
  };
}

const defaults = {
  query: "",
  seatFilter: "all" as const,
  stakeFilter: "all",
};

describe("lobby selectors", () => {
  it("excludes ended games, bot modes and empty public rooms", () => {
    const tables = [
      makeTable({ id: "valid" }),
      makeTable({ id: "closed", status: "finished" }),
      makeTable({ id: "bot", mode: "DEMO_AI" }),
      makeTable({ id: "simulation", mode: "SIMULATION_SOLO" }),
      makeTable({ id: "empty", player_count: 0 }),
      makeTable({ id: "private", player_count: 0, is_private: true }),
    ];
    expect(selectLobbyTables(tables, defaults).map((t) => t.id)).toEqual([
      "valid",
      "private",
    ]);
    expect(countActiveLobbyTables(tables).all).toBe(2);
  });

  it("prioritizes joined and joinable tables without changing input order", () => {
    const tables = [
      makeTable({ id: "full", player_count: 4 }),
      makeTable({ id: "joinable", player_count: 1 }),
      makeTable({ id: "mine", player_count: 4, joined: true }),
    ];
    expect(selectLobbyTables(tables, defaults).map((t) => t.id)).toEqual([
      "mine",
      "joinable",
      "full",
    ]);
    expect(tables.map((t) => t.id)).toEqual(["full", "joinable", "mine"]);
    expect(
      selectLobbyTables(tables, { ...defaults, seatFilter: "available" }).map(
        (t) => t.id,
      ),
    ).toEqual(["mine", "joinable"]);
  });

  it("preserves named, mine and wager filters", () => {
    const tables = [
      makeTable({ id: "free", name: "Salon", stake_amount: 0 }),
      makeTable({
        id: "premium",
        name: "Salon VIP",
        stake_amount: 15000,
        game_type: "poker",
        joined: true,
      }),
    ];
    expect(
      selectLobbyTables(tables, {
        query: "VIP",
        seatFilter: "mine",
        stakeFilter: "10000",
      }).map((t) => t.id),
    ).toEqual(["premium"]);
    const counts = countActiveLobbyTables(tables);
    expect(counts.belote).toBe(1);
    expect(counts.poker).toBe(1);
  });
});
