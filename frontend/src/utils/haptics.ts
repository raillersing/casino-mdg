/**
 * Utility for tactile haptic feedback (vibrations) on mobile devices.
 * Uses the standard HTML5 Vibration API (navigator.vibrate) with safe fallbacks.
 */

const STORAGE_KEY = "casino_haptics_enabled";

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
    if (typeof localStorage !== "undefined") return localStorage;
  } catch {
    return null;
  }
  return null;
}

export const haptics = {
  /**
   * Check if the device and browser support the Vibration API
   */
  isSupported(): boolean {
    return typeof navigator !== "undefined" && "vibrate" in navigator;
  },

  /**
   * Check if haptic feedback is enabled in user preferences
   */
  isEnabled(): boolean {
    if (!this.isSupported()) return false;
    const storage = getStorage();
    if (!storage) return true;
    const stored = storage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === "true";
  },

  /**
   * Enable or disable haptic feedback
   */
  setEnabled(enabled: boolean): void {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    }
  },

  /**
   * Internal trigger helper
   */
  trigger(pattern: number | number[]): boolean {
    if (!this.isEnabled()) return false;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
        return Boolean(navigator.vibrate(pattern));
      }
      return false;
    } catch {
      return false;
    }
  },

  /**
   * Subtle tick for quick UI interactions (selecting chips, soft taps)
   */
  lightTick(): void {
    this.trigger(15);
  },

  /**
   * Feutred pulse for card dealing
   */
  cardDeal(): void {
    this.trigger([15, 30, 15]);
  },

  /**
   * Firm pulse for placing a bet or calling/raising
   */
  betPlaced(): void {
    this.trigger(35);
  },

  /**
   * Urgent double pulse when it's player's turn to act or countdown is critical (< 5s)
   */
  actionTurnAlert(): void {
    this.trigger([80, 50, 80]);
  },

  /**
   * Triumphant rhythmic vibration for winning a pot
   */
  winCelebration(): void {
    this.trigger([60, 40, 100, 50, 180]);
  },

  /**
   * Dull vibration for folding / folding cards
   */
  fold(): void {
    this.trigger(45);
  },

  /**
   * Quick tactile feedback for general button taps
   */
  buttonTap(): void {
    this.trigger(12);
  },
};
