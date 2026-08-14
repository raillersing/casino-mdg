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
  isGuest: boolean;
  guestName: string | null;
  guestBalance: number;
  guestXP: number;
  guestLevel: number;

  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (value: boolean) => void;
  setCurrentTable: (tableId: string | null) => void;
  setCurrentGame: (gameType: string | null) => void;
  setReconnecting: (value: boolean) => void;
  setLanguage: (lang: "fr" | "mg") => void;
  setSession: (accessToken: string, refreshToken: string) => void;
  setGuestMode: (name: string, balance?: number) => void;
  clearGuestMode: () => void;
  addGuestXP: (amount: number) => void;
  adjustGuestBalance: (delta: number) => void;
  logout: () => void;
}

const guestKey = "mdg_guest";
const savedGuest =
  typeof window !== "undefined"
    ? JSON.parse(localStorage.getItem(guestKey) || "null")
    : null;

export const useGameStore = create<GameState>((set, get) => ({
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
  isGuest: Boolean(savedGuest),
  guestName: savedGuest?.name || null,
  guestBalance: savedGuest?.balance ?? 10000,
  guestXP: savedGuest?.xp ?? 0,
  guestLevel: savedGuest?.level ?? 1,

  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setCurrentTable: (tableId) => set({ currentTable: tableId }),
  setCurrentGame: (gameType) => set({ currentGame: gameType }),
  setReconnecting: (value) => set({ isReconnecting: value }),
  setLanguage: (lang) => set({ language: lang }),
  setSession: (accessToken, refreshToken) => {
    localStorage.setItem("mdg_access_token", accessToken);
    localStorage.setItem("mdg_refresh_token", refreshToken);
    set({ accessToken, refreshToken, isAuthenticated: true, isGuest: false });
  },
  setGuestMode: (name, balance = 10000) => {
    const payload = { name, balance, xp: 0, level: 1 };
    localStorage.setItem(guestKey, JSON.stringify(payload));
    set({ isGuest: true, guestName: name, guestBalance: balance, guestXP: 0, guestLevel: 1 });
  },
  clearGuestMode: () => {
    localStorage.removeItem(guestKey);
    set({ isGuest: false, guestName: null, guestBalance: 10000, guestXP: 0, guestLevel: 1 });
  },
  addGuestXP: (amount) => {
    const state = get();
    const nextXP = state.guestXP + amount;
    const nextLevel = Math.floor(nextXP / 500) + 1;
    const payload = {
      name: state.guestName,
      balance: state.guestBalance,
      xp: nextXP,
      level: nextLevel,
    };
    localStorage.setItem(guestKey, JSON.stringify(payload));
    set({ guestXP: nextXP, guestLevel: nextLevel });
  },
  adjustGuestBalance: (delta) => {
    const state = get();
    const nextBal = Math.max(0, state.guestBalance + delta);
    const payload = {
      name: state.guestName,
      balance: nextBal,
      xp: state.guestXP,
      level: state.guestLevel,
    };
    localStorage.setItem(guestKey, JSON.stringify(payload));
    set({ guestBalance: nextBal });
  },
  logout: () => {
    localStorage.removeItem("mdg_access_token");
    localStorage.removeItem("mdg_refresh_token");
    localStorage.removeItem(guestKey);
    set({
      isAuthenticated: false,
      user: null,
      currentTable: null,
      currentGame: null,
      accessToken: null,
      refreshToken: null,
      isGuest: false,
      guestName: null,
      guestBalance: 10000,
      guestXP: 0,
      guestLevel: 1,
    });
  },
}));
