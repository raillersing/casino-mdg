export type ProductEventName =
  | "activation_viewed"
  | "test_games_opened"
  | "demo_started"
  | "matchmaking_started"
  | "matchmaking_cancelled"
  | "human_match_found"
  | "test_game_played"
  | "game_error"
  | "invite_sent"
  | "invite_joined";

type EventContext = {
  mode?: string;
  game_type?: string;
  metadata?: Record<string, unknown>;
};

function storedId(key: string) {
  const current = localStorage.getItem(key);
  if (current) return current;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}

export async function trackEvent(
  eventName: ProductEventName,
  context: EventContext = {},
) {
  const token = localStorage.getItem("mdg_access_token");
  try {
    await fetch("/api/v1/analytics/events/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        event_id: crypto.randomUUID(),
        event_name: eventName,
        anonymous_id: storedId("mdg_analytics_anonymous_id"),
        session_id: storedId("mdg_analytics_session_id"),
        ...context,
      }),
      keepalive: true,
    });
  } catch {
    // Analytics must never block a game or navigation journey.
  }
}
