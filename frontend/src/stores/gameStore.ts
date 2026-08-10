import { create } from 'zustand'

interface User {
  id: string
  displayName: string
  email: string
  avatar?: string
  xp: number
  level: number
  balance: number
}

interface GameState {
  isAuthenticated: boolean
  user: User | null
  currentTable: string | null
  currentGame: string | null
  isReconnecting: boolean
  language: 'fr' | 'mg'
  
  // Actions
  setUser: (user: User | null) => void
  setAuthenticated: (value: boolean) => void
  setCurrentTable: (tableId: string | null) => void
  setCurrentGame: (gameType: string | null) => void
  setReconnecting: (value: boolean) => void
  setLanguage: (lang: 'fr' | 'mg') => void
  logout: () => void
}

export const useGameStore = create<GameState>((set) => ({
  isAuthenticated: false,
  user: null,
  currentTable: null,
  currentGame: null,
  isReconnecting: false,
  language: 'fr',
  
  setUser: (user) => set({ user }),
  setAuthenticated: (value) => set({ isAuthenticated: value }),
  setCurrentTable: (tableId) => set({ currentTable: tableId }),
  setCurrentGame: (gameType) => set({ currentGame: gameType }),
  setReconnecting: (value) => set({ isReconnecting: value }),
  setLanguage: (lang) => set({ language: lang }),
  logout: () => set({
    isAuthenticated: false,
    user: null,
    currentTable: null,
    currentGame: null,
  }),
}))
