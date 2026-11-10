import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import {
  X,
  Sparkles,
  Users,
  Clock,
  Lock,
  Globe,
  Dices,
  Sliders,
  Loader2,
  Check,
  ShieldAlert,
  Coins,
} from "lucide-react";
import { CreateTablePayload, GameTable } from "../../services/games";
import { useGameStore } from "../../stores/gameStore";
import { haptics } from "../../utils/haptics";

export type Game = "poker" | "belote" | "rami" | "ludo" | "domino";

type Capability = {
  players: number[];
  rules: Record<string, number[]>;
  defaults: Record<string, number>;
  summary: string;
  summary_mg?: string;
};

interface CreateTableModalProps {
  initialGameType?: Game;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateTablePayload) => Promise<GameTable>;
}

const GAME_METAS: Record<
  Game,
  {
    name: string;
    name_mg: string;
    suit: string;
    color: string;
    desc: string;
    desc_mg: string;
    defaultName: string;
  }
> = {
  belote: {
    name: "Belote Malagasy",
    name_mg: "Beloty Gasy",
    suit: "♥",
    color: "#ef4444",
    desc: "4 Joueurs · 2 Équipes · Atouts & Annonces",
    desc_mg: "Mpilalao 4 · Ekipa 2 · Atout sy Fanambarana",
    defaultName: "Table Belote",
  },
  domino: {
    name: "Domino Double-Six",
    name_mg: "Dôminô Double-Six",
    suit: "🁓",
    color: "#f59e0b",
    desc: "2 à 4 Joueurs · Manche rapide · Pioche",
    desc_mg: "Mpilalao 2 hatramin'ny 4 · Fihodinana haingana",
    defaultName: "Table Domino",
  },
  ludo: {
    name: "Ludo Mada",
    name_mg: "Ludo Malagasy",
    suit: "🎲",
    color: "#10b981",
    desc: "2 à 4 Joueurs · 4 Pions · Sortie sur 6",
    desc_mg: "Mpilalao 2 hatramin'ny 4 · Piona 4 · Mivoaka amin'ny 6",
    defaultName: "Table Ludo",
  },
  rami: {
    name: "Rami Malagasy",
    name_mg: "Ramy Gasy",
    suit: "♦",
    color: "#3b82f6",
    desc: "2 à 4 Joueurs · 7 Cartes · Knock/Gin",
    desc_mg: "Mpilalao 2 hatramin'ny 4 · Karatra 7 · Faranana knock",
    defaultName: "Table Rami",
  },
  poker: {
    name: "Poker Texas Hold'em",
    name_mg: "Poker Texas Hold'em",
    suit: "♠",
    color: "#d3b06b",
    desc: "2 à 9 Joueurs · No-Limit · Jetons gratuits",
    desc_mg: "Mpilalao 2 hatramin'ny 9 · No-Limit · Jetona maimaim-poana",
    defaultName: "Table Poker VIP",
  },
};

const FUN_NAMES: Record<Game, string[]> = {
  belote: [
    "Table des As",
    "Belote Tanà VIP",
    "Fihavanana Belote",
    "Salegy Royale",
    "Carré de Valets",
    "Belote Moramora",
  ],
  domino: [
    "Double-Six Mada",
    "Domino Gasikara",
    "Pose Royale",
    "Le Grand Capic",
    "Manche Flash",
  ],
  ludo: [
    "Ludo Malagasy",
    "Course des As",
    "Pions d'Or",
    "Derby Antananarivo",
    "Ludo Fihavanana",
  ],
  rami: [
    "Rami Prestige",
    "Tierce Royale",
    "Rami 101 Mada",
    "Carré Magique",
    "Salon Ravinala",
  ],
  poker: [
    "High Roller Mada",
    "Table Océan Indien",
    "Texas Hold'em VIP",
    "All-In Antananarivo",
    "Royal Flush Club",
  ],
};

export function CreateTableModal({
  initialGameType = "belote",
  isOpen,
  onClose,
  onSubmit,
}: CreateTableModalProps) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, translated: string) => (mg ? translated : fr);

  const formRef = useRef<HTMLFormElement>(null);
  const user = useGameStore((state) => state.user);
  const availableBalance = user?.mgaBalance ?? 0;

  const creationKey = useRef("");
  const availableBalanceRef = useRef(availableBalance);
  availableBalanceRef.current = availableBalance;

  const [capabilities, setCapabilities] = useState<Record<
    string,
    Capability
  > | null>(null);
  const [game, setGame] = useState<Game>(initialGameType);
  const [players, setPlayers] = useState(4);
  const [duration, setDuration] = useState(30);
  const [rules, setRules] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [privateRoom, setPrivate] = useState(false);
  const [stakeAmount, setStakeAmount] = useState<number>(
    initialGameType === "poker" ? 5000 : 0,
  );
  const [buyIn, setBuyIn] = useState<number>(
    initialGameType === "poker" ? Math.min(availableBalance, 50000) : 0,
  );
  const [preset, setPreset] = useState<"standard" | "blitz" | "duo" | "custom">(
    "standard",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, busy, onClose]);

  useEffect(() => {
    if (isOpen) {
      creationKey.current = crypto.randomUUID();
      setGame(initialGameType);
      const suggestions = FUN_NAMES[initialGameType] || ["Table Casino"];
      setName(suggestions[Math.floor(Math.random() * suggestions.length)]);
      if (initialGameType === "poker") {
        setStakeAmount(0);
        setBuyIn(0);
      } else {
        setStakeAmount(0);
        setBuyIn(0);
      }
    }
  }, [isOpen, initialGameType]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setError("");
    fetch("/api/v1/games/table-capabilities/", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Réglages indisponibles");
        return r.json();
      })
      .then((data) => {
        setCapabilities(data.games);
        const c = data.games[initialGameType];
        if (c) {
          setPlayers(c.players[0]);
          setRules(c.defaults);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [isOpen, initialGameType]);

  const config = capabilities?.[game];

  // Helper to apply presets
  const applyPreset = (presetType: "standard" | "blitz" | "duo" | "custom") => {
    haptics.tabChange();
    setPreset(presetType);
    if (!config) return;

    if (presetType === "standard") {
      setDuration(30);
      setPlayers(config.players[0]);
      setRules(config.defaults);
    } else if (presetType === "blitz") {
      setDuration(15);
      setPlayers(config.players[0]);
      setRules(config.defaults);
    } else if (presetType === "duo") {
      setDuration(15);
      if (config.players.includes(2)) setPlayers(2);
    }
  };

  const handleSelectGame = (nextGame: Game) => {
    haptics.tabChange();
    setGame(nextGame);
    const suggestions = FUN_NAMES[nextGame] || ["Table Casino"];
    setName(suggestions[Math.floor(Math.random() * suggestions.length)]);
    if (nextGame === "poker") {
      setStakeAmount(0);
      setBuyIn(0);
    } else {
      setStakeAmount(0);
      setBuyIn(0);
    }
    const c = capabilities?.[nextGame];
    if (c) {
      setPlayers(c.players[0]);
      setRules(c.defaults);
      setPreset("standard");
      setDuration(30);
    }
  };

  const rollRandomName = () => {
    haptics.lightTick();
    const suggestions = FUN_NAMES[game] || ["Table de jeu"];
    const currentIdx = suggestions.indexOf(name);
    let nextIdx = Math.floor(Math.random() * suggestions.length);
    if (nextIdx === currentIdx) {
      nextIdx = (currentIdx + 1) % suggestions.length;
    }
    setName(suggestions[nextIdx]);
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="create-table-modal-modern"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-table-title"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onClose();
          if (e.key === "Tab") {
            const nodes = e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input, select",
            );
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        {/* Mobile Swipe / Sheet Handle */}
        <div className="modal-sheet-handle" aria-hidden="true" />

        {/* 1. Header with Title & Game Badge */}
        <div className="create-modal-header">
          <div className="create-modal-header-info">
            <span
              className="create-modal-suit-badge"
              style={{ color: GAME_METAS[game].color }}
            >
              {GAME_METAS[game].suit}
            </span>
            <div>
              <h2 id="create-table-title">
                {tr("Créer une table", "Hamorona latabatra")}
              </h2>
              <span className="create-modal-subtitle">
                {mg ? GAME_METAS[game].desc_mg : GAME_METAS[game].desc}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="create-modal-close-btn"
            onClick={onClose}
            disabled={busy}
            aria-label={tr("Fermer", "Hanakatona")}
          >
            <X size={20} />
          </button>
        </div>

        <form
          ref={formRef}
          className="create-modal-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!config || busy) return;
            setBusy(true);
            setError("");
            if (stakeAmount > 0) {
              if (game === "poker") {
                if (buyIn < stakeAmount) {
                  setError(
                    `Le tapis d'entrée doit être au moins égal au minimum (${(stakeAmount || 5000).toLocaleString()} Ar).`,
                  );
                  setBusy(false);
                  return;
                }
                if (buyIn > availableBalance) {
                  setError("Le tapis choisi dépasse votre solde disponible.");
                  setBusy(false);
                  return;
                }
              } else if (availableBalance < stakeAmount) {
                setError(
                  `Votre solde disponible (${availableBalance.toLocaleString()} Ar) est insuffisant pour la mise de ${stakeAmount.toLocaleString()} Ar.`,
                );
                setBusy(false);
                return;
              }
            }
            try {
              await onSubmit({
                idempotency_key: creationKey.current,
                name:
                  name.trim() ||
                  `${GAME_METAS[game].name} #${Math.floor(100 + Math.random() * 900)}`,
                game_type: game,
                max_players: players,
                is_private: privateRoom,
                stake_amount: stakeAmount,
                buy_in: game === "poker" && stakeAmount > 0 ? buyIn : (stakeAmount > 0 ? stakeAmount : 0),
                turn_duration: duration,
                rules_config: rules,
              });
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {/* Scrollable Content Body */}
          <div className="create-modal-scroll-body">
            {/* 2. Visual Game Selector Ribbon */}
            <div className="create-field-group">
              <label className="create-field-label" htmlFor="game-select-input">
                {tr("Choisir le jeu", "Safidio ny lalao")}
              </label>

              {/* Accessible standard select for accessibility & Playwright tests */}
              <select
                id="game-select-input"
                aria-label={tr("Jeu", "Lalao")}
                value={game}
                onChange={(e) => handleSelectGame(e.target.value as Game)}
                className="visually-hidden-accessible"
              >
                {(["belote", "domino", "ludo", "rami", "poker"] as const).map(
                  (id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ),
                )}
              </select>

              {/* High-touch tactile Game Picker */}
              <div className="create-game-grid">
                {(["belote", "domino", "ludo", "rami", "poker"] as const).map(
                  (gKey) => {
                    const meta = GAME_METAS[gKey];
                    const isSelected = game === gKey;
                    return (
                      <button
                        key={gKey}
                        type="button"
                        className={`create-game-pill ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelectGame(gKey)}
                      >
                        <span
                          className="create-game-suit"
                          style={{ color: meta.color }}
                        >
                          {meta.suit}
                        </span>
                        <span className="create-game-name">
                          {meta.name.split(" ")[0]}
                        </span>
                      </button>
                    );
                  },
                )}
              </div>
            </div>

            {/* 3. Quick Mode Presets (Partie Rapide, Standard, Duo, etc.) */}
            <div className="create-field-group">
              <span className="create-field-label">
                {tr("Mode de partie", "Karazam-pilalaovana")}
              </span>
              <div className="create-presets-row">
                <button
                  type="button"
                  className={`create-preset-btn ${preset === "standard" ? "active" : ""}`}
                  onClick={() => applyPreset("standard")}
                >
                  <Sparkles size={14} />
                  <span>{tr("Standard", "Mahazatra")}</span>
                </button>
                <button
                  type="button"
                  className={`create-preset-btn ${preset === "blitz" ? "active" : ""}`}
                  onClick={() => applyPreset("blitz")}
                >
                  <Clock size={14} />
                  <span>{tr("⚡ Blitz (15s)", "⚡ Haingana (15s)")}</span>
                </button>
                {config && config.players.includes(2) && (
                  <button
                    type="button"
                    className={`create-preset-btn ${preset === "duo" ? "active" : ""}`}
                    onClick={() => applyPreset("duo")}
                  >
                    <Users size={14} />
                    <span>{tr("Duo (2J)", "Duo (2J)")}</span>
                  </button>
                )}
                <button
                  type="button"
                  className={`create-preset-btn ${preset === "custom" ? "active" : ""}`}
                  onClick={() => applyPreset("custom")}
                >
                  <Sliders size={14} />
                  <span>{tr("Détails", "Antsipiriany")}</span>
                </button>
              </div>
            </div>

            {/* 4. Table Name Input with Random Name Roller */}
            <div className="create-field-group">
              <label className="create-field-label" htmlFor="table-name-input">
                {tr("Nom de la table", "Anaran’ny latabatra")}
              </label>
              <div className="create-name-input-wrap">
                <input
                  id="table-name-input"
                  value={name}
                  maxLength={80}
                  placeholder={GAME_METAS[game].defaultName}
                  onChange={(e) => setName(e.target.value)}
                  className="create-name-input"
                />
                <button
                  type="button"
                  className="create-name-dice-btn"
                  onClick={rollRandomName}
                  title={tr("Nom aléatoire", "Anarana kisendrasendra")}
                  aria-label={tr(
                    "Générer un nom aléatoire",
                    "Hanoratra anarana kisendrasendra",
                  )}
                >
                  <Dices size={18} />
                </button>
              </div>
            </div>

            {/* 5. Detailed Game Settings (Players, Turn, Rules) */}
            {config && (
              <div className="create-options-card">
                {/* Number of Players */}
                <div className="create-option-row">
                  <div className="create-option-label-wrap">
                    <Users size={16} />
                    <span>{tr("Nombre de joueurs", "Isan'ny mpilalao")}</span>
                  </div>

                  {/* Accessible select for tests & screen readers */}
                  <select
                    aria-label={tr("Joueurs", "Mpilalao")}
                    value={players}
                    onChange={(e) => {
                      setPlayers(Number(e.target.value));
                      setPreset("custom");
                    }}
                    className="create-select-accessible"
                  >
                    {config.players.map((n) => (
                      <option key={n} value={n}>
                        {n} {tr("joueurs", "mpilalao")}
                      </option>
                    ))}
                  </select>

                  {/* Visual Touch Pills */}
                  <div className="create-pill-selector">
                    {config.players.map((n) => (
                      <button
                        key={n}
                        type="button"
                        className={`create-option-pill ${players === n ? "active" : ""}`}
                        onClick={() => {
                          haptics.lightTick();
                          setPlayers(n);
                          setPreset("custom");
                        }}
                      >
                        {n} {tr("J", "M")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Turn Duration */}
                <div className="create-option-row">
                  <div className="create-option-label-wrap">
                    <Clock size={16} />
                    <span>{tr("Rythme (tour)", "Faharetan'ny anjara")}</span>
                  </div>

                  {/* Accessible select */}
                  <select
                    aria-label={tr(
                      "Durée d’un tour",
                      "Fotoana isaky ny anjara",
                    )}
                    value={duration}
                    onChange={(e) => {
                      setDuration(Number(e.target.value));
                      setPreset("custom");
                    }}
                    className="create-select-accessible"
                  >
                    {[10, 15, 30, 60, 90, 120].map((n) => (
                      <option key={n} value={n}>
                        {n} {tr("secondes", "segondra")}
                      </option>
                    ))}
                  </select>

                  <div className="create-pill-selector">
                    {[15, 30, 60].map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`create-option-pill ${duration === s ? "active" : ""}`}
                        onClick={() => {
                          haptics.lightTick();
                          setDuration(s);
                          setPreset("custom");
                        }}
                      >
                        {s}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Specific Rules (e.g. Belote Score or Poker Small Blind) */}
                {Object.entries(config.rules).map(([key, values]) => {
                  const isScore = key === "target_score";
                  const labelFr = isScore
                    ? "Score à atteindre"
                    : "Petite blind (grande blind = double)";
                  const labelMg = isScore
                    ? "Isa kendrena"
                    : "Blind kely (avo roa heny ny blind lehibe)";

                  return (
                    <div key={key} className="create-option-row">
                      <div className="create-option-label-wrap">
                        <Sparkles size={16} />
                        <span>{tr(labelFr, labelMg)}</span>
                      </div>

                      {/* Accessible select */}
                      <select
                        aria-label={tr(labelFr, labelMg)}
                        value={rules[key]}
                        onChange={(e) => {
                          setRules({ ...rules, [key]: Number(e.target.value) });
                          setPreset("custom");
                        }}
                        className="create-select-accessible"
                      >
                        {values.map((n) => (
                          <option key={n} value={n}>
                            {n} {isScore ? "pts" : "jetons"}
                          </option>
                        ))}
                      </select>

                      <div className="create-pill-selector">
                        {values.map((val) => (
                          <button
                            key={val}
                            type="button"
                            className={`create-option-pill ${rules[key] === val ? "active" : ""}`}
                            onClick={() => {
                              haptics.lightTick();
                              setRules({ ...rules, [key]: val });
                              setPreset("custom");
                            }}
                          >
                            {val} {isScore ? "pts" : ""}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Ariary Minimum Stake & Buy-In */}
                <div
                  style={{
                    marginTop: "16px",
                    paddingTop: "12px",
                    borderTop: "1px solid var(--border-color, #2a3742)",
                  }}
                >
                  <div className="create-option-row">
                    <div className="create-option-label-wrap">
                      <Coins size={16} />
                      <span>
                        {game === "poker"
                          ? tr(
                              "Tapis minimum de table (Ar)",
                              "Tapis kely indrindra (Ar)",
                            )
                          : tr(
                              "Mise fixe par joueur (Ar)",
                              "Loka isaky ny mpilalao (Ar)",
                            )}
                      </span>
                    </div>
                    <div className="create-pill-selector">
                      {(game === "poker"
                        ? [0, 5000, 10000, 25000]
                        : [0, 1000, 2000, 5000]
                      ).map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          className={`create-option-pill ${stakeAmount === amt ? "active" : ""}`}
                          onClick={() => {
                            haptics.lightTick();
                            setStakeAmount(amt);
                            if (game === "poker") {
                              if (amt > 0) {
                                setBuyIn(
                                  Math.max(
                                    amt,
                                    Math.min(availableBalance, 50000),
                                  ),
                                );
                              } else {
                                setBuyIn(0);
                              }
                            }
                          }}
                        >
                          {amt === 0
                            ? "Gratuit"
                            : `${amt >= 1000 ? `${amt / 1000}K` : amt} Ar`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Informative Stake Note */}
                  <p className="create-rules-hint" style={{ marginTop: "8px" }}>
                    {stakeAmount === 0
                      ? tr(
                          "Jetons de jeu uniquement ; aucun débit du portefeuille.",
                          "Jetona filalaovana ihany ; tsy alaina amin’ny poketra.",
                        )
                      : tr(
                          game === "poker"
                            ? "Tapis réservé en Ariary depuis votre portefeuille."
                            : "Mise fixe réservée en Ariary depuis votre portefeuille.",
                          game === "poker"
                            ? "Tapis amin’ny Ariary avy amin’ny poketra."
                            : "Loka amin’ny Ariary avy amin’ny poketra.",
                        )}
                  </p>

                  {game === "poker" && stakeAmount > 0 && (
                    <div style={{ marginTop: "14px" }}>
                      <label
                        htmlFor="create-creator-buyin"
                        className="create-field-label"
                        style={{ fontSize: "13px" }}
                      >
                        {tr("Mon tapis à l'entrée (Ar)", "Tapis hidirako (Ar)")}
                      </label>
                      <input
                        id="create-creator-buyin"
                        type="number"
                        min={stakeAmount || 5000}
                        max={availableBalance}
                        step="1000"
                        value={buyIn || ""}
                        onChange={(e) =>
                          setBuyIn(Math.max(0, Number(e.target.value)))
                        }
                        style={{
                          width: "100%",
                          padding: "10px 14px",
                          borderRadius: "8px",
                          background: "var(--bg-dark, #0b1014)",
                          border: "1px solid var(--border-color, #2a3742)",
                          color: "#fff",
                          fontSize: "16px",
                          fontWeight: 700,
                          marginBottom: "8px",
                        }}
                      />
                      <div
                        className="create-pill-selector"
                        style={{ marginBottom: "6px" }}
                      >
                        {[5000, 10000, 25000, 50000]
                          .filter(
                            (a) =>
                              a >= (stakeAmount || 5000) &&
                              a <= availableBalance,
                          )
                          .map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              className={`create-option-pill ${buyIn === amt ? "active" : ""}`}
                              onClick={() => {
                                haptics.lightTick();
                                setBuyIn(amt);
                              }}
                            >
                              {amt / 1000}K Ar
                            </button>
                          ))}
                        {availableBalance >= (stakeAmount || 5000) && (
                          <button
                            type="button"
                            className={`create-option-pill ${buyIn === availableBalance ? "active" : ""}`}
                            onClick={() => {
                              haptics.lightTick();
                              setBuyIn(availableBalance);
                            }}
                          >
                            Max ({availableBalance.toLocaleString()} Ar)
                          </button>
                        )}
                      </div>
                      <small
                        style={{
                          color: "var(--text-secondary, #adb9c4)",
                          display: "block",
                        }}
                      >
                        Minimum {(stakeAmount || 5000).toLocaleString()} Ar ·
                        sans plafond de table · dans la limite de votre solde (
                        {availableBalance.toLocaleString()} Ar).
                      </small>
                      <small
                        style={{
                          color: "#70d7ad",
                          display: "block",
                          marginTop: "4px",
                        }}
                      >
                        La partie commence dès 2 joueurs connectés.
                      </small>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 6. Visibility: Public Table vs Private Invitation */}
            <div className="create-field-group">
              <span className="create-field-label">
                {tr(
                  "Confidentialité de la salle",
                  "Tsiambaratelon'ny efitrano",
                )}
              </span>
              <div className="create-privacy-toggle-grid">
                <button
                  type="button"
                  className={`create-privacy-card ${!privateRoom ? "active" : ""}`}
                  onClick={() => {
                    haptics.lightTick();
                    setPrivate(false);
                  }}
                >
                  <div className="create-privacy-head">
                    <Globe size={18} />
                    <span>
                      {tr("Table Publique", "Latabatra ho an'ny rehetra")}
                    </span>
                  </div>
                  <small>
                    {tr(
                      "Visible dans le lobby, accessible à tous les joueurs.",
                      "Hita ao amin'ny lobby, afaka miditra ny rehetra.",
                    )}
                  </small>
                </button>

                <button
                  type="button"
                  className={`create-privacy-card ${privateRoom ? "active" : ""}`}
                  onClick={() => {
                    haptics.lightTick();
                    setPrivate(true);
                  }}
                >
                  <div className="create-privacy-head">
                    <Lock size={18} />
                    <span>{tr("Table Privée", "Latabatra manokana")}</span>
                  </div>
                  <small>
                    {tr(
                      "Protégée par un code secret à 6 caractères.",
                      "Misy kaody miafina isa 6 ho an'ny mpinamana.",
                    )}
                  </small>
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {error && (
              <div
                className="error-banner"
                role="alert"
                style={{ margin: "14px 0 0" }}
              >
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Sticky Bottom Actions Bar (Optimized for Mobile Thumb Reach) */}
          <div className="create-modal-footer">
            <button
              type="button"
              className="button button-secondary create-modal-cancel-btn"
              onClick={onClose}
              disabled={busy}
            >
              {tr("Annuler", "Hanafoana")}
            </button>
            <button
              type="submit"
              className="button button-gold create-modal-submit-btn"
              disabled={busy || !config}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>{tr("Création…", "Eo am-pamoronana…")}</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>
                    {game === "poker" && buyIn > 0
                      ? tr(
                          `Créer et rejoindre avec ${buyIn.toLocaleString()} Ar`,
                          `Hamorona sy hiditra amin'ny ${buyIn.toLocaleString()} Ar`,
                        )
                      : tr(
                          `Créer la table (${GAME_METAS[game].name.split(" ")[0]})`,
                          `Hamorona (${GAME_METAS[game].name.split(" ")[0]})`,
                        )}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
