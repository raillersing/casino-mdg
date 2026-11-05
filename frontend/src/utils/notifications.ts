import { haptics } from "./haptics";

function getGlobalNotification(): typeof Notification | undefined {
  if (typeof window !== "undefined" && "Notification" in window) {
    return window.Notification;
  }
  if (typeof globalThis !== "undefined" && "Notification" in globalThis) {
    return (globalThis as unknown as { Notification: typeof Notification })
      .Notification;
  }
  return undefined;
}

/**
 * Utility to manage browser Web Notifications and PWA Push alerts.
 */
export const webNotifications = {
  /**
   * Checks whether the current environment supports Web Notifications.
   */
  isSupported(): boolean {
    return getGlobalNotification() !== undefined;
  },

  /**
   * Returns current permission status: "granted", "denied", or "default".
   */
  getPermission(): NotificationPermission {
    const Notif = getGlobalNotification();
    if (!Notif) return "denied";
    return Notif.permission;
  },

  /**
   * Requests user permission for native desktop / mobile push notifications.
   */
  async requestPermission(): Promise<NotificationPermission> {
    const Notif = getGlobalNotification();
    if (!Notif) return "denied";
    try {
      const permission = await Notif.requestPermission();
      return permission;
    } catch {
      return "denied";
    }
  },

  /**
   * Sends a native Web Push notification if permission has been granted.
   */
  send(title: string, options: NotificationOptions = {}): boolean {
    const Notif = getGlobalNotification();
    if (!Notif) return false;
    if (Notif.permission !== "granted") return false;

    try {
      // If service worker registration is active, prefer showNotification for PWA
      if (
        typeof navigator !== "undefined" &&
        "serviceWorker" in navigator &&
        navigator.serviceWorker.controller
      ) {
        navigator.serviceWorker.ready
          .then((reg) => {
            void reg.showNotification(title, {
              icon: "/pwa-192x192.png",
              badge: "/pwa-192x192.png",
              ...options,
            });
          })
          .catch(() => {
            new Notif(title, options);
          });
      } else {
        new Notif(title, {
          icon: "/pwa-192x192.png",
          ...options,
        });
      }
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Trigger notification when it's the player's turn to act.
   */
  notifyTurn(tableName: string) {
    haptics.actionTurnAlert();
    this.send("♠ C'est à vous de jouer !", {
      body: `C'est votre tour d'action sur la table ${tableName}. Ne laissez pas le timer expirer !`,
      tag: "player-turn",
    });
  },

  /**
   * Trigger notification when a Sit & Go or tournament is starting.
   */
  notifyTournamentStart(tourneyName: string) {
    haptics.winCelebration();
    this.send("🏆 Le tournoi commence !", {
      body: `${tourneyName} est complet et démarre immédiatement. Rejoignez votre table !`,
      tag: "tournament-start",
    });
  },

  /**
   * Trigger notification when player claims or wins rewards.
   */
  notifyReward(title: string, amountMGA: number) {
    haptics.winCelebration();
    this.send(`🎉 ${title}`, {
      body: `Félicitations ! Vous avez reçu ${amountMGA.toLocaleString("fr-FR")} Ar sur votre compte.`,
      tag: "reward-win",
    });
  },
};
