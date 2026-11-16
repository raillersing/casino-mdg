import { useTranslation } from "react-i18next";
import { cardView } from "@utils/gamePresentation";

type GameControlSound =
  | "take"
  | "pass"
  | "choose_trump"
  | "announce_belote"
  | "card_played"
  | "chip"
  | "draw"
  | "knock"
  | "meld"
  | "discard";

export function GameSpecificControls({
  gameType,
  phase,
  hand,
  onAction,
  onSound,
  enabled,
  selectedCards,
  onClearSelection,
  state,
  statePlayers,
  userId,
}: {
  gameType: string;
  phase?: string;
  hand: Array<{ rank: number; suit: number }>;
  onAction: (action: string, payload?: unknown) => void;
  onSound: (kind: GameControlSound) => void;
  enabled: boolean;
  selectedCards?: Set<string>;
  onClearSelection?: () => void;
  state?: Record<string, unknown>;
  statePlayers?: Array<Record<string, unknown>>;
  userId?: string;
}) {
  const { t } = useTranslation();
  if (gameType === "belote") {
    const biddingRound = Number(state?.bidding_round ?? 1);
    // Bidding phase
    if (phase === "bidding") {
      if (biddingRound === 1) {
        return (
          <div className="action-row belote-controls">
            <button
              className="action-bet"
              disabled={!enabled}
              onClick={() => {
                onSound("take");
                onAction("take");
              }}
            >
              {t("game.take")}
            </button>
            <button
              className="action-fold"
              disabled={!enabled}
              onClick={() => {
                onSound("pass");
                onAction("pass");
              }}
            >
              {t("game.pass")}
            </button>
          </div>
        );
      }
      // Second round: choose any suit
      const suits = [
        { label: "♣", value: 0, color: "#4db6ac" },
        { label: "♦", value: 1, color: "#e57373" },
        { label: "♥", value: 2, color: "#ba68c8" },
        { label: "♠", value: 3, color: "#64b5f6" },
      ];
      return (
        <div className="action-row belote-controls">
          <span className="muted" style={{ marginRight: 8 }}>
            {t("game.chooseTrump")} :
          </span>
          {suits.map((suit) => (
            <button
              key={suit.value}
              className="action-check"
              disabled={!enabled}
              onClick={() => {
                onSound("choose_trump");
                onAction("choose_trump", { suit: suit.value });
              }}
              style={{ color: suit.color }}
            >
              {suit.label}
            </button>
          ))}
          <button
            className="action-fold"
            disabled={!enabled}
            onClick={() => {
              onSound("pass");
              onAction("pass");
            }}
          >
            {t("game.pass")}
          </button>
        </div>
      );
    }
    if (phase === "all_passed") {
      return (
        <div className="action-row belote-controls">
          <span className="muted">
            {t("game.allPassed")} — {t("game.redeal")}
          </span>
        </div>
      );
    }
    // Playing phase
    const beloteAnnounced = Array.isArray(state?.belote_announced)
      ? (state?.belote_announced as boolean[])
      : [];
    const myPlayerIndex = (statePlayers || []).findIndex(
      (p) => String(p.id || "") === userId,
    );
    const canAnnounceBelote =
      myPlayerIndex >= 0 && !beloteAnnounced[myPlayerIndex];
    return (
      <div className="action-row belote-controls">
        {canAnnounceBelote && (
          <button
            className="action-bet"
            disabled={!enabled}
            onClick={() => {
              onSound("announce_belote");
              onAction("announce_belote");
            }}
          >
            {t("game.announceBelote")}
          </button>
        )}
        {hand.length > 0 ? (
          hand.map((card) => (
            <button
              className="action-check"
              disabled={!enabled}
              key={`${card.suit}-${card.rank}`}
              onClick={() => {
                onSound("card_played");
                onAction("play_card", { card });
              }}
            >
              {t("game.play")} {cardView(card).value}
              {cardView(card).suit}
            </button>
          ))
        ) : (
          <span className="muted">{t("game.waiting")}</span>
        )}
      </div>
    );
  }

  if (gameType === "ludo") {
    const canRoll = Boolean(state?.can_roll ?? true);
    const canMove = Boolean(state?.can_move ?? false);
    const validMoves = Array.isArray(state?.valid_moves)
      ? (state.valid_moves as number[])
      : [];
    const lastRoll = Number(state?.last_roll ?? 0);
    const myPlayerIndex = (statePlayers || []).findIndex(
      (p) => String(p.id || "") === userId,
    );
    const myPawns =
      myPlayerIndex >= 0 &&
      Array.isArray(
        (statePlayers?.[myPlayerIndex] as Record<string, unknown>)?.pawns,
      )
        ? ((statePlayers?.[myPlayerIndex] as Record<string, unknown>)
            .pawns as Array<{ id: number; state: string; position: number }>)
        : [];

    return (
      <div
        className="action-row ludo-controls"
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        {canRoll && (
          <button
            className="action-bet"
            disabled={!enabled}
            onClick={() => {
              onSound("chip");
              onAction("roll_dice");
            }}
            style={{
              fontWeight: "bold",
              padding: "10px 20px",
              fontSize: "1rem",
            }}
          >
            🎲 {t("game.rollDice") || "Lancer le Dé"}
          </button>
        )}
        {canMove && validMoves.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "8px",
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span className="muted" style={{ fontWeight: 600 }}>
              Dé: {lastRoll} — {t("game.choosePawn") || "Déplacer le pion"} :
            </span>
            {validMoves.map((pawnId) => {
              const pawn = myPawns.find((p) => p.id === pawnId);
              const pState =
                pawn?.state === "base"
                  ? "Yard"
                  : pawn?.state === "home_path"
                    ? "Coulloir"
                    : `Pos ${pawn?.position ?? 0}`;
              return (
                <button
                  key={pawnId}
                  className="action-check"
                  disabled={!enabled}
                  onClick={() => {
                    onSound("chip");
                    onAction("move_pawn", { pawn_id: pawnId });
                  }}
                >
                  ♟️ Pion #{pawnId + 1} ({pState})
                </button>
              );
            })}
          </div>
        )}
        {!canRoll && !canMove && (
          <span className="muted">
            {t("game.waitingOpponent") || "Tour de l'adversaire..."}
          </span>
        )}
      </div>
    );
  }

  if (gameType === "domino") {
    const myPlayer = (statePlayers || []).find(
      (p) => String(p.id || "") === userId,
    ) as Record<string, unknown> | undefined;
    const dominoHand = Array.isArray(myPlayer?.hand)
      ? (myPlayer.hand as Array<{ left: number; right: number }>)
      : [];
    const leftEnd = Number(state?.left_end ?? -1);
    const rightEnd = Number(state?.right_end ?? -1);
    const boneyardCount = Array.isArray(state?.boneyard)
      ? (state.boneyard as unknown[]).length
      : Number(state?.boneyard_count ?? 0);
    const boardEmpty = leftEnd === -1 && rightEnd === -1;

    const canPlayTile = (t: { left: number; right: number }) => {
      if (boardEmpty) return true;
      return (
        t.left === leftEnd ||
        t.right === leftEnd ||
        t.left === rightEnd ||
        t.right === rightEnd
      );
    };

    const hasPlayable = dominoHand.some(canPlayTile);

    return (
      <div
        className="action-row domino-controls"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          alignItems: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: "6px",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {dominoHand.length > 0 ? (
            dominoHand.map((t, idx) => {
              const playable = canPlayTile(t);
              const matchesLeft =
                boardEmpty || t.left === leftEnd || t.right === leftEnd;
              const matchesRight =
                boardEmpty || t.left === rightEnd || t.right === rightEnd;
              const matchesBoth =
                !boardEmpty &&
                matchesLeft &&
                matchesRight &&
                leftEnd !== rightEnd;

              return (
                <div key={idx} style={{ display: "flex", gap: "2px" }}>
                  {matchesBoth ? (
                    <>
                      <button
                        className="action-check"
                        disabled={!enabled}
                        onClick={() => {
                          onSound("card_played");
                          onAction("play_tile", { tile: t, side: "left" });
                        }}
                        style={{ padding: "8px 10px", fontSize: "0.85rem" }}
                      >
                        ◀ [{t.left}|{t.right}]
                      </button>
                      <button
                        className="action-check"
                        disabled={!enabled}
                        onClick={() => {
                          onSound("card_played");
                          onAction("play_tile", { tile: t, side: "right" });
                        }}
                        style={{ padding: "8px 10px", fontSize: "0.85rem" }}
                      >
                        [{t.left}|{t.right}] ▶
                      </button>
                    </>
                  ) : (
                    <button
                      className="action-check"
                      disabled={!enabled || !playable}
                      onClick={() => {
                        onSound("card_played");
                        const side = matchesLeft ? "left" : "right";
                        onAction("play_tile", { tile: t, side });
                      }}
                      style={{
                        padding: "8px 12px",
                        fontWeight: "bold",
                        opacity: playable ? 1 : 0.45,
                        border: playable
                          ? "1px solid #10b981"
                          : "1px solid #4b5563",
                      }}
                    >
                      [{t.left} | {t.right}]
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <span className="muted">
              {t("game.noTiles") || "Aucun domino en main"}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
          {boneyardCount > 0 && !hasPlayable && (
            <button
              className="action-bet"
              disabled={!enabled}
              onClick={() => {
                onSound("draw");
                onAction("draw_tile");
              }}
            >
              📥 {t("game.drawTile") || "Piocher dans le Talon"} (
              {boneyardCount})
            </button>
          )}
          {boneyardCount === 0 && !hasPlayable && (
            <button
              className="action-fold"
              disabled={!enabled}
              onClick={() => {
                onSound("pass");
                onAction("pass");
              }}
            >
              ⛔ {t("game.passDomino") || "Passer (Bouder)"}
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="action-row rami-controls">
      <button
        className="action-check"
        disabled={!enabled || hand.length > 7}
        onClick={() => {
          onSound("draw");
          onAction("draw");
        }}
      >
        {t("game.draw")}
      </button>
      <button
        className="action-fold"
        disabled={!enabled}
        onClick={() => {
          onSound("knock");
          onAction("knock");
        }}
      >
        {t("game.knock")}
      </button>
      {selectedCards && selectedCards.size > 0 && (
        <>
          <button
            className="action-bet"
            disabled={!enabled || selectedCards.size < 3}
            onClick={() => {
              const cards = hand.filter((c) =>
                selectedCards.has(`${c.suit}-${c.rank}`),
              );
              onSound("meld");
              onAction("meld", { cards });
              onClearSelection?.();
            }}
          >
            {t("game.meld")} ({selectedCards.size})
          </button>
          <button className="action-fold" onClick={() => onClearSelection?.()}>
            {t("game.cancel")}
          </button>
        </>
      )}
      {hand.length > 0 ? (
        hand.map((card) => (
          <button
            className="action-bet"
            disabled={!enabled}
            key={`${card.suit}-${card.rank}`}
            onClick={() => {
              onSound("discard");
              onAction("discard", { card });
            }}
          >
            {t("game.discardCard")} {cardView(card).value}
            {cardView(card).suit}
          </button>
        ))
      ) : (
        <span className="muted">{t("game.waiting")}</span>
      )}
    </div>
  );
}
