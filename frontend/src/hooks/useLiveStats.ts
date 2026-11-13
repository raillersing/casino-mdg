import { useQuery } from "react-query";
import { getLiveStats } from "@services/games";

export function useLiveStats() {
  return useQuery("verified-live-game-statistics", () => getLiveStats(), {
    staleTime: 30000,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
