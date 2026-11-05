import { useQuery } from "react-query";
import { getLiveStats } from "@services/games";

export function useLiveStats() {
  return useQuery("verified-live-game-statistics", () => getLiveStats(), {
    staleTime: 10000,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}
