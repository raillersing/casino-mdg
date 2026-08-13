import { create } from "zustand";

interface User {
  id: string;
  displayName: string;
  email: string;
  avatar?: string;
  xp: number;
  level: number;
  balance: number;
  isStaff?: boolean;
}

interface GameState {
  isAuthenticated: boolean;
  user: User | null;
  currentTable: string | null;
  currentGame: string | null;
  isReconnecting: boolean;
  language: "fr" | "mg";
  accessToken: string | null;
  refreshToken: string | null;

  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (value: boolean) => void;
  setCurrentTable: (tableId: string | null) => void;
  setCurrentGame: (gameType: string | null) => void;
  setReconnecting: (value: boolean) => void;
  setLanguage: (lang: "fr" | "mg") => void;
  setSession: (accessToken: string, refreshToken: string) => void;
  logout: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  isAuthenticated:
    typeof window !== "undefined" &&
    Boolean(localStorage.getItem("mdg_access_token")),
  user: null,
  currentTable: null,
  currentGame: null,
  isReconnecting: false,
  language: "fr",
  accessToken:
    typeof window !== "undefined"
      ? localStorage.getItem("mdg_access_token")
      : null,
  refreshToken:
    typeof window !== "undefined"
      ? localStorage.getItem("mdg_refresh_token")
      : null,

  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setCurrentTable: (tableId) => set({ currentTable: tableId }),
  setCurrentGame: (gameType) => set({ currentGame: gameType }),
  setReconnecting: (value) => set({ isReconnecting: value }),
  setLanguage: (lang) => set({ language: lang }),
  setSession: (accessToken, refreshToken) => {
    localStorage.setItem("mdg_access_token", accessToken);
    localStorage.setItem("mdg_refresh_token", refreshToken);
    set({ accessToken, refreshToken, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem("mdg_access_token");
    localStorage.removeItem("mdg_refresh_token");
    set({
      isAuthenticated: false,
      user: null,
      currentTable: null,
      currentGame: null,
      accessToken: null,
      refreshToken: null,
    });
  },
}));
