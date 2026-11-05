import { Minus, Plus, Bot } from "lucide-react";

interface BotCountSelectorProps {
  gameType: "poker" | "belote" | "rami" | "ludo" | "domino";
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function BotCountSelector({
  gameType,
  value,
  onChange,
  disabled,
}: BotCountSelectorProps) {
  const max = gameType === "poker" ? 8 : 3;
  const min = 1;
  const totalPlayers = value + 1;
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="bot-count-selector">
      <span className="bot-count-label">
        <Bot size={14} /> Bots {value} → {totalPlayers} joueurs
      </span>
      <div className="bot-count-controls">
        <button
          type="button"
          className="button button-small"
          onClick={() => onChange(clamp(value - 1))}
          disabled={disabled || value <= min}
          aria-label="Retirer un bot"
        >
          <Minus size={14} />
        </button>
        <span className="bot-count-value">{value}</span>
        <button
          type="button"
          className="button button-small"
          onClick={() => onChange(clamp(value + 1))}
          disabled={disabled || value >= max}
          aria-label="Ajouter un bot"
        >
          <Plus size={14} />
        </button>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        disabled={disabled}
        className="bot-count-range"
        aria-label="Nombre de bots"
      />
    </div>
  );
}
