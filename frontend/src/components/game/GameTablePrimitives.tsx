import type { CSSProperties } from "react";
import { avatarColor } from "@utils/gameAvatar";

export function PlayerSeat({
  pos,
  name,
  chips,
  bet = 0,
  active = false,
  folded = false,
  action = "",
  badge = "",
  thinking = false,
  botChat,
  playerChat,
  seatStyle,
  hasCards = false,
  stats,
}: {
  pos: string;
  name: string;
  chips: string;
  bet?: number;
  active?: boolean;
  folded?: boolean;
  action?: string;
  badge?: string;
  thinking?: boolean;
  botChat?: { text: string; emote: string };
  playerChat?: string | null;
  seatStyle?: CSSProperties;
  hasCards?: boolean;
  stats?: string;
}) {
  const avColor = avatarColor(name);
  const activeBubble =
    playerChat || (botChat ? `${botChat.emote} ${botChat.text}` : null);
  return (
    <div
      className={`player-seat seat-${pos} ${active ? "active-seat" : ""} ${folded ? "folded-seat" : ""}`}
      style={seatStyle}
      title={stats ? `${name} — ${stats}` : name}
    >
      <div className="seat-avatar" style={{ background: avColor }}>
        {name[0]}
      </div>
      <div>
        <strong>{name}</strong>
        <span>{chips}</span>
        {stats && <small className="seat-stats">{stats}</small>}
      </div>
      {badge && (
        <i
          className={`seat-badge ${badge.includes("D") ? "seat-dealer" : badge.includes("BB") ? "seat-big-blind" : badge.includes("SB") ? "seat-small-blind" : ""}`}
        >
          {badge}
        </i>
      )}
      {action && <b className="seat-action-bubble">{action}</b>}
      {thinking && !activeBubble && (
        <span className="seat-thinking-bubble">…</span>
      )}
      {activeBubble && <span className="seat-chat-bubble">{activeBubble}</span>}
      {bet > 0 && <span className="seat-bet-chip">{bet}</span>}
      {hasCards && (
        <div className="seat-hole-cards">
          <span className="seat-card-back" />
          <span className="seat-card-back" />
        </div>
      )}
    </div>
  );
}

export function PlayingCard({
  value,
  suit,
  suitIndex,
  red,
  hidden,
  selected,
  onClick,
  className = "",
  style,
}: {
  value: string;
  suit: string;
  suitIndex?: number;
  red?: boolean;
  hidden?: boolean;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const suitClass =
    suitIndex !== undefined
      ? ["suit-club", "suit-diamond", "suit-heart", "suit-spade"][suitIndex] ||
        ""
      : "";
  const isRed =
    red || ["♦", "♥"].includes(suit) || suitIndex === 1 || suitIndex === 2;

  if (hidden) {
    return (
      <div
        className={`playing-card hidden-card card-deluxe ${className}`}
        onClick={onClick}
        style={style}
      >
        <div className="card-back-pattern">
          <span className="card-back-emblem">✦</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      style={style}
      className={`playing-card card-deluxe ${suitClass} ${isRed ? "card-red red" : "card-black"} ${selected ? "selected" : ""} ${className}`}
    >
      <div className="card-corner card-corner-tl">
        <span className="card-val">{value}</span>
        <span className="card-sym">{suit}</span>
      </div>
      <div className="card-center-suit">
        <span>{suit}</span>
      </div>
      <div className="card-corner card-corner-br">
        <span className="card-val">{value}</span>
        <span className="card-sym">{suit}</span>
      </div>
    </button>
  );
}
