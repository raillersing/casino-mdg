import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Loader2, Settings2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CreateTablePayload, GameTable } from "../../services/games";

type Game = GameTable["game_type"];
type Capability = { players: number[]; defaults: Record<string, number> };

interface Props {
  game: Game;
  isOpen: boolean;
  onClose: () => void;
  onAdvanced: () => void;
  onSubmit: (payload: CreateTablePayload) => Promise<GameTable>;
}

/** A compact free-table path; money and advanced rules remain in the full form. */
export function QuickCreateTableSheet({
  game,
  isOpen,
  onClose,
  onAdvanced,
  onSubmit,
}: Props) {
  const { i18n } = useTranslation();
  const mg = i18n.language.startsWith("mg");
  const tr = (fr: string, malagasy: string) => (mg ? malagasy : fr);
  const [capability, setCapability] = useState<Capability | null>(null);
  const [players, setPlayers] = useState(2);
  const [privateRoom, setPrivateRoom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const keyRef = useRef("");
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    keyRef.current = crypto.randomUUID();
    setError("");
    setCapability(null);
    setPrivateRoom(false);
    setLoading(true);
    const controller = new AbortController();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    fetch("/api/v1/games/table-capabilities/", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(mg ? "Tsy misy ny fikirana." : "Réglages indisponibles.");
        return response.json() as Promise<{ games: Record<string, Capability> }>;
      })
      .then((payload) => {
        const next = payload.games?.[game];
        if (!next || !next.players?.length) {
          throw new Error(mg ? "Tsy azo lalaovina ity." : "Ce jeu n'est pas disponible.");
        }
        if (controller.signal.aborted) return;
        setCapability(next);
        setPlayers(next.players.includes(2) ? 2 : next.players[0]);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus();
    };
  }, [isOpen, game, mg]);

  if (!isOpen) return null;

  const submit = async () => {
    if (!capability || busy) return;
    setBusy(true);
    setError("");
    try {
      await onSubmit({
        idempotency_key: keyRef.current,
        name: `${game.charAt(0).toUpperCase() + game.slice(1)} #${Math.floor(100 + Math.random() * 900)}`,
        game_type: game,
        max_players: players,
        is_private: privateRoom,
        stake_amount: 0,
        turn_duration: 30,
        rules_config: capability.defaults,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const trapFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !busy) {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab") return;
    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      "button:not([disabled])",
    );
    if (!controls?.length) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="quick-table-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section
        ref={dialogRef}
        className="quick-table-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-table-title"
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        <div className="quick-table-sheet-header">
          <div>
            <span className="quick-table-eyebrow">
              {tr("Création rapide", "Famoronana haingana")}
            </span>
            <h2 id="quick-table-title">
              {tr("Créer une table de", "Hamorona latabatra")} {game.toUpperCase()}
            </h2>
          </div>
          <button
            type="button"
            aria-label={tr("Fermer", "Hanakatona")}
            className="quick-table-close"
            onClick={onClose}
            disabled={busy}
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        {loading ? (
          <div className="quick-table-loading" role="status">
            <Loader2 className="spin" aria-hidden="true" />
            {tr("Chargement des règles…", "Miandry ny fitsipika…")}
          </div>
        ) : capability && (
          <>
            <fieldset className="quick-table-field">
              <legend>{tr("Combien de joueurs ?", "Firy ny mpilalao?")}</legend>
              <div className="quick-table-segments">
                {capability.players.map((count) => (
                  <button
                    key={count}
                    type="button"
                    aria-pressed={players === count}
                    className={players === count ? "selected" : ""}
                    onClick={() => setPlayers(count)}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="quick-table-field">
              <legend>{tr("Qui peut rejoindre ?", "Iza no afaka miditra?")}</legend>
              <div className="quick-table-segments">
                <button
                  type="button"
                  className={!privateRoom ? "selected" : ""}
                  aria-pressed={!privateRoom}
                  onClick={() => setPrivateRoom(false)}
                >
                  {tr("Tout le monde", "Ny rehetra")}
                </button>
                <button
                  type="button"
                  className={privateRoom ? "selected" : ""}
                  aria-pressed={privateRoom}
                  onClick={() => setPrivateRoom(true)}
                >
                  {tr("Sur invitation", "Nasaina ihany")}
                </button>
              </div>
            </fieldset>
            <p className="quick-table-no-stake">
              {tr(
                "Cette création rapide est sans mise en Ariary.",
                "Tsy misy vola Ariary amin'ity famoronana haingana ity.",
              )}
            </p>
          </>
        )}

        {error && <p className="quick-table-error" role="alert">{error}</p>}

        <div className="quick-table-actions">
          <button
            type="button"
            className="quick-table-submit"
            disabled={!capability || busy || loading}
            onClick={() => void submit()}
          >
            {busy && <Loader2 size={18} className="spin" aria-hidden="true" />}
            {tr("Créer et rejoindre", "Hamorona sy hiditra")}
          </button>
          <button
            type="button"
            className="quick-table-advanced"
            disabled={busy}
            onClick={onAdvanced}
          >
            <Settings2 size={17} aria-hidden="true" />
            {tr("Options avancées et mises", "Safidy fanampiny sy vola")}
          </button>
        </div>
      </section>
    </div>
  );
}
