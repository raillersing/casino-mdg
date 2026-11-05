import { useTranslation } from "react-i18next";
import { useEffect, useRef, useState } from "react";
import { CreateTablePayload, GameTable } from "../../services/games";

type Game = "poker" | "belote" | "rami" | "ludo" | "domino";
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
  useEffect(() => {
    if (isOpen) {
      const previous = document.activeElement as HTMLElement | null;
      const id = window.setTimeout(
        () => formRef.current?.querySelector<HTMLElement>("select")?.focus(),
        0,
      );
      return () => {
        window.clearTimeout(id);
        previous?.focus();
      };
    }
  }, [isOpen]);
  const [capabilities, setCapabilities] = useState<Record<
    string,
    Capability
  > | null>(null);
  const [game, setGame] = useState<Game>(initialGameType);
  const [players, setPlayers] = useState(4);
  const [duration, setDuration] = useState(30);
  const [rules, setRules] = useState<Record<string, number>>({});
  const [name, setName] = useState("");
  const [privateRoom, setPrivate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    setError("");
    setCapabilities(null);
    fetch("/api/v1/games/table-capabilities/", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw Error("Réglages indisponibles");
        return r.json();
      })
      .then((data) => {
        setCapabilities(data.games);
        setGame(initialGameType);
        setPlayers(
          data.games[initialGameType].players[
            data.games[initialGameType].players.length - 1
          ],
        );
        setRules(data.games[initialGameType].defaults);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      });
    return () => controller.abort();
  }, [isOpen, initialGameType]);
  if (!isOpen) return null;
  const config = capabilities?.[game];
  return (
    <div className="modal-backdrop">
      <section
        className="modal-card"
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
        <h2 id="create-table-title">
          {tr("Créer une table", "Hamorona latabatra")}
        </h2>
        <form
          ref={formRef}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!config || busy) return;
            setBusy(true);
            setError("");
            try {
              await onSubmit({
                name: name.trim() || `Table ${game}`,
                game_type: game,
                max_players: players,
                is_private: privateRoom,
                stake_amount: 0,
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
          <label>
            {tr("Jeu", "Lalao")}
            <select
              aria-label={tr("Jeu", "Lalao")}
              value={game}
              onChange={(e) => {
                const next = e.target.value as Game;
                setGame(next);
                const c = capabilities?.[next];
                if (c) {
                  setPlayers(c.players[c.players.length - 1]);
                  setRules(c.defaults);
                }
              }}
            >
              {["belote", "domino", "ludo", "rami", "poker"].map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            {tr("Nom de table", "Anaran’ny latabatra")}
            <input
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {config && (
            <>
              <p>{mg ? config.summary_mg || config.summary : config.summary}</p>
              <label>
                {tr("Joueurs", "Mpilalao")}
                <select
                  aria-label={tr("Joueurs", "Mpilalao")}
                  value={players}
                  onChange={(e) => setPlayers(Number(e.target.value))}
                >
                  {config.players.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Durée d’un tour", "Fotoana isaky ny anjara")}
                <select
                  aria-label={tr("Durée d’un tour", "Fotoana isaky ny anjara")}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                >
                  {[10, 15, 30, 60, 90, 120].map((n) => (
                    <option key={n} value={n}>
                      {n} {tr("secondes", "segondra")}
                    </option>
                  ))}
                </select>
              </label>
              {Object.entries(config.rules).map(([key, values]) => (
                <label key={key}>
                  {key === "target_score"
                    ? tr("Score à atteindre", "Isa kendrena")
                    : tr(
                        "Petite blind (grande blind = double)",
                        "Blind kely (avo roa heny ny blind lehibe)",
                      )}
                  <select
                    aria-label={
                      key === "target_score"
                        ? tr("Score à atteindre", "Isa kendrena")
                        : tr(
                            "Petite blind (grande blind = double)",
                            "Blind kely (avo roa heny ny blind lehibe)",
                          )
                    }
                    value={rules[key]}
                    onChange={(e) =>
                      setRules({ ...rules, [key]: Number(e.target.value) })
                    }
                  >
                    {values.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
              ))}
              <p>
                {game === "poker"
                  ? tr(
                      "Jetons de jeu uniquement ; aucun débit du portefeuille.",
                      "Jetona filalaovana ihany ; tsy alaina amin’ny poketra.",
                    )
                  : tr("Partie gratuite.", "Lalao maimaim-poana.")}
              </p>
            </>
          )}
          <label>
            <input
              type="checkbox"
              checked={privateRoom}
              onChange={(e) => setPrivate(e.target.checked)}
            />{" "}
            {tr(
              "Table privée sur invitation",
              "Latabatra manokana misy fanasana",
            )}
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-secondary"
              onClick={onClose}
              disabled={busy}
            >
              {tr("Annuler", "Hanafoana")}
            </button>
            <button className="button button-gold" disabled={busy || !config}>
              {busy
                ? tr("Création…", "Eo am-pamoronana…")
                : tr("Créer la table", "Hamorona latabatra")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
