export function badgeForSeat(
  player: Record<string, unknown> | undefined,
  state: Record<string, unknown> | null,
) {
  if (!player || !state) return "";
  const playerId = String(player.id || "");
  const badges: string[] = [];
  if (state.button_player_id != null) {
    if (playerId === String(state.button_player_id || "")) badges.push("D");
    if (playerId === String(state.small_blind_player_id || ""))
      badges.push("SB");
    if (playerId === String(state.big_blind_player_id || "")) badges.push("BB");
  }
  return badges.join(" · ");
}

export function cardView(card: { rank: number; suit: number }) {
  const suits = ["♣", "♦", "♥", "♠"];
  const ranks: Record<number, string> = {
    2: "2",
    3: "3",
    4: "4",
    5: "5",
    6: "6",
    7: "7",
    8: "8",
    9: "9",
    10: "10",
    11: "J",
    12: "Q",
    13: "K",
    14: "A",
  };
  return {
    value: ranks[card.rank] || "?",
    suit: suits[card.suit] || "",
    suitIndex: card.suit,
    red: card.suit === 1 || card.suit === 2,
  };
}

export function tokenSubject(token: string | null) {
  if (!token) return "";
  try {
    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    ) as { sub?: string };
    return payload.sub || "";
  } catch {
    return "";
  }
}

export function pokerPhaseLabel(phase: string) {
  return (
    (
      {
        preflop: "Préflop",
        flop: "Flop",
        turn: "Turn",
        river: "River",
        showdown: "Showdown",
      } as Record<string, string>
    )[phase] || phase
  );
}

export function actionLabel(action: string, phase?: string) {
  if (action === "street_changed") {
    return phase === "showdown"
      ? "Showdown"
      : `${pokerPhaseLabel(phase || "")} distribué`;
  }
  return (
    (
      {
        fold: "Se couche",
        check: "Check",
        call: "Suit",
        bet: "Mise",
        raise: "Relance",
        all_in: "Tapis (All-in)",
        new_hand: "Nouvelle manche",
        hand_started: "Manche lancée",
        hand_summary: "Fin de manche",
        post_sb: "Petite blinde",
        post_bb: "Grosse blinde",
        showdown: "Abattage (Showdown)",
        play_card: "Carte jouée",
        draw: "Pioche",
        discard: "Défausse",
        roll_dice: "Lancer de dé",
        move_pawn: "Déplacement pion",
        play_tile: "Pose domino",
        draw_tile: "Pioche domino",
        pass: "Passe",
      } as Record<string, string>
    )[action] || action
  );
}
