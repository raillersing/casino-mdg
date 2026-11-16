import type { GameTable } from "@services/games";

/**
 * Pure UI selectors: never infer real connected players from reserved seats.
 * The server remains authoritative for admission and table state.
 */
export type LobbyFilters = {
  query: string;
  seatFilter: "all" | "available" | "mine";
  stakeFilter: string;
};

function isLobbyTable(table: GameTable) {
  return (
    table.status !== "finished" &&
    table.mode !== "DEMO_AI" &&
    table.mode !== "SIMULATION_SOLO" &&
    (table.is_private || (table.player_count ?? 0) > 0)
  );
}

export function countActiveLobbyTables(tables: readonly GameTable[]) {
  const counts = {
    all: 0,
    belote: 0,
    domino: 0,
    ludo: 0,
    rami: 0,
    poker: 0,
  };
  for (const table of tables) {
    if (!isLobbyTable(table)) continue;
    counts.all += 1;
    counts[table.game_type] += 1;
  }
  return counts;
}

export function selectLobbyTables(
  tables: readonly GameTable[],
  { query, seatFilter, stakeFilter }: LobbyFilters,
): GameTable[] {
  return tables
    .filter((table) => {
      if (!isLobbyTable(table)) return false;
      if (!table.name.toLowerCase().includes(query.toLowerCase())) return false;
      if (
        seatFilter === "available" &&
        table.player_count >= table.max_players &&
        !table.joined
      )
        return false;
      if (seatFilter === "mine" && !table.joined) return false;
      if (stakeFilter === "all") return true;
      const minimum = Number(table.stake_amount || 0);
      return stakeFilter === "10000"
        ? minimum >= 10000
        : minimum === Number(stakeFilter);
    })
    .sort((a, b) => {
      // An admitted seat comes first, then joinable, then full tables.
      const priority = (table: GameTable) =>
        table.joined ? 0 : table.player_count < table.max_players ? 1 : 2;
      return priority(a) - priority(b);
    });
}
