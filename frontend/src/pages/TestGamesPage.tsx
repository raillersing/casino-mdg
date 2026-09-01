import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Clock3,
  Dices,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Ticket,
  Trophy,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { getWalletBalance, type WalletBalance } from "@services/wallet";
import {
  enterTestDraw,
  getTestActivity,
  getTestDraws,
  getTestGames,
  playTestGame,
  simulateTestDraw,
  type InstantGame,
  type InstantPlay,
  type TestDraw,
} from "@services/testGames";
import { useGameStore } from "@stores/gameStore";
import { trackEvent } from "@services/analytics";
import { createGuestToken } from "@services/auth";

import { SlotMachine } from "@components/casino/SlotMachine";
import { LuckyWheel } from "@components/casino/LuckyWheel";
import { MysteryChests } from "@components/casino/MysteryChests";
import { BigWinModal } from "@components/casino/BigWinModal";

type Tab = "instant" | "draws" | "activity" | "fairness";

const DEFAULT_GAMES: InstantGame[] = [
  {
    slug: "slots-mada",
    name: "Trésor Royal Slots",
    game_type: "slots",
    version: "v1",
    cost: 100,
    max_prize: 5000,
    status: "active",
    mode: "SIMULATION_SOLO",
    rules: {},
  },
  {
    slug: "coffre-mada",
    name: "Coffre Mada",
    game_type: "scratch",
    version: "v1",
    cost: 100,
    max_prize: 500,
    status: "active",
    mode: "SIMULATION_SOLO",
    rules: {},
  },
  {
    slug: "roue-mdg",
    name: "Roue MDG",
    game_type: "wheel",
    version: "v1",
    cost: 0,
    max_prize: 250,
    status: "active",
    mode: "SIMULATION_SOLO",
    rules: {},
  },
];

const DEFAULT_DRAWS: TestDraw[] = [
  {
    slug: "jackpot-mdg",
    name: "Jackpot MDG",
    draw_type: "five_numbers",
    version: "v1",
    status: "open",
    mode: "SIMULATION_SOLO",
    entry_cost: 100,
    closes_at: new Date(Date.now() + 86400000 * 5).toISOString(),
    rules: {},
    result: null,
  },
  {
    slug: "tirage-3-chiffres",
    name: "Tirage 3 chiffres",
    draw_type: "three_digits",
    version: "v1",
    status: "open",
    mode: "SIMULATION_SOLO",
    entry_cost: 50,
    closes_at: new Date(Date.now() + 86400000 * 2).toISOString(),
    rules: {},
    result: null,
  },
];

export function TestGamesPage() {
  const { t } = useTranslation();
  const accessToken = useGameStore((state) => state.accessToken);
  const setSession = useGameStore((state) => state.setSession);
  const setGuestMode = useGameStore((state) => state.setGuestMode);
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>((params.get("tab") as Tab) || "instant");
  const [games, setGames] = useState<InstantGame[]>(DEFAULT_GAMES);
  const [draws, setDraws] = useState<TestDraw[]>(DEFAULT_DRAWS);
  const [plays, setPlays] = useState<InstantPlay[]>([]);
  const [entries, setEntries] = useState<
    Array<{
      entry_id: string;
      draw_slug: string;
      draw_name: string;
      numbers: number[];
      created_at: string;
    }>
  >([]);
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [selectedDraw, setSelectedDraw] = useState<string | null>(null);
  const [drawSelections, setDrawSelections] = useState<Record<string, number[]>>({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [lastPlay, setLastPlay] = useState<InstantPlay | null>(null);
  const [bigWinPlay, setBigWinPlay] = useState<InstantPlay | null>(null);
  const [selectedGameSlug, setSelectedGameSlug] = useState<string>("slots-mada");

  const navigate = useNavigate();

  const ensureToken = async (): Promise<string | null> => {
    if (accessToken) return accessToken;
    try {
      const auth = await createGuestToken("Joueur Invité");
      setSession(auth.access, auth.refresh);
      setGuestMode(auth.user.display_name, auth.wallet.balance);
      return auth.access;
    } catch {
      navigate("/auth");
      return null;
    }
  };

  const load = useCallback(async () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [catalog, drawList, activity, wallet] = await Promise.all([
        getTestGames(accessToken),
        getTestDraws(accessToken),
        getTestActivity(accessToken),
        getWalletBalance(accessToken),
      ]);
      setGames(catalog.results.length > 0 ? catalog.results : DEFAULT_GAMES);
      setDraws(drawList.results.length > 0 ? drawList.results : DEFAULT_DRAWS);
      setPlays(activity.plays);
      setEntries(activity.entries);
      setBalance(wallet);
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
        useGameStore.getState().logout();
        setError(t("testGames.sessionExpired"));
      } else {
        setError(
          reason instanceof Error ? reason.message : t("testGames.loadError"),
        );
      }
    } finally {
      setLoading(false);
    }
  }, [accessToken, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void trackEvent("test_games_opened", { metadata: { source: "direct" } });
  }, []);

  const changeTab = (next: Tab) => {
    setTab(next);
    setParams({ tab: next });
  };

  const playInstantAsync = async (game: InstantGame): Promise<InstantPlay | null> => {
    setAction(game.slug);
    setError("");
    const token = await ensureToken();
    if (!token) {
      setAction("");
      return null;
    }
    const key = crypto.randomUUID();
    try {
      const play = await playTestGame(token, game.slug, key);
      setLastPlay(play);
      void trackEvent("test_game_played", {
        mode: "SIMULATION_SOLO",
        metadata: { game_slug: game.slug, prize: play.prize },
      });
      await load();
      return play;
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
        useGameStore.getState().logout();
        setError(t("testGames.sessionExpired"));
      } else {
        setError(
          reason instanceof Error ? reason.message : t("testGames.playError"),
        );
      }
      return null;
    } finally {
      setAction("");
    }
  };

  const numbersFor = (draw: TestDraw) => drawSelections[draw.slug] || [];
  const toggleNumber = (draw: TestDraw, number: number) => {
    const current = numbersFor(draw);
    if (draw.draw_type === "three_digits") {
      const next =
        current.length < 3
          ? [...current, number]
          : [current[1], current[2], number];
      setDrawSelections({ ...drawSelections, [draw.slug]: next });
      return;
    }
    const next = current.includes(number)
      ? current.filter((item) => item !== number)
      : [...current, number].slice(-5);
    setDrawSelections({ ...drawSelections, [draw.slug]: next });
  };

  const submitEntry = async (draw: TestDraw) => {
    setAction(draw.slug);
    setError("");
    const token = await ensureToken();
    if (!token) {
      setAction("");
      return;
    }
    const numbers = numbersFor(draw);
    try {
      await enterTestDraw(token, draw.slug, numbers, crypto.randomUUID());
      setSelectedDraw(null);
      await load();
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
        useGameStore.getState().logout();
        setError(t("testGames.sessionExpired"));
      } else {
        setError(
          reason instanceof Error ? reason.message : t("testGames.entryError"),
        );
      }
    } finally {
      setAction("");
    }
  };

  const simulateDraw = async (draw: TestDraw) => {
    setAction(`draw:${draw.slug}`);
    setError("");
    const token = await ensureToken();
    if (!token) {
      setAction("");
      return;
    }
    try {
      const result = await simulateTestDraw(token, draw.slug);
      setDraws((current) =>
        current.map((item) => (item.slug === draw.slug ? result : item)),
      );
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
        useGameStore.getState().logout();
        setError(t("testGames.sessionExpired"));
      } else {
        setError(
          reason instanceof Error ? reason.message : t("testGames.drawError"),
        );
      }
    } finally {
      setAction("");
    }
  };

  return (
    <div className="page-stack test-games-page">
      {/* Big Win Celebration Modal */}
      <BigWinModal
        isOpen={Boolean(bigWinPlay)}
        onClose={() => setBigWinPlay(null)}
        prize={bigWinPlay?.prize || 0}
        label={bigWinPlay?.result_label || "Gain Exceptionnel !"}
        gameName={
          games.find((g) => g.slug === bigWinPlay?.game_slug)?.name || "Casino MDG"
        }
      />

      {/* Hero */}
      <section className="test-games-hero">
        <div>
          <span className="eyebrow gold">
            <Sparkles size={13} /> CASINO & JEUX INSTANTANÉS
          </span>
          <h1>
            🎰 Jeux de Hasard
            <br />
            <em>& Tirages Provably Fair.</em>
          </h1>
          <p>
            Vivez l'adrénaline des machines à sous, de la roue de la fortune et des coffres aux trésors dans un environnement auditable et transparent.
          </p>
          <div className="test-games-hero-actions">
            <button
              className="button button-gold"
              onClick={() => changeTab("instant")}
            >
              <Dices size={16} /> Jeux instantanés & Slots
            </button>
            <button
              className="button button-outline"
              onClick={() => changeTab("draws")}
            >
              <Ticket size={16} /> Tirages & Jackpot
            </button>
          </div>
        </div>
        <div className="test-games-balance">
          <span>Solde de simulation</span>
          <strong>
            {balance?.balance.toLocaleString("fr-FR") || "10 000"} <small>SIM</small>
          </strong>
          <span className="test-games-status">
            <i /> Sans risque monétaire · Sandbox certifié
          </span>
        </div>
      </section>

      {/* Trust & Fairness Banner */}
      <div className="test-games-notice">
        <ShieldCheck size={17} />
        <span>
          <strong>Équité prouvée (Provably Fair) :</strong> Le serveur calcule chaque tirage de façon cryptographique et transparente.
        </span>
        <button className="text-link" onClick={() => changeTab("fairness")}>
          Vérifier les preuves <ChevronRight size={14} />
        </button>
      </div>

      {/* Navigation Tabs */}
      <nav className="test-games-tabs" aria-label={t("testGames.tabsLabel")}>
        {(["instant", "draws", "activity", "fairness"] as Tab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => changeTab(item)}
          >
            {item === "instant"
              ? "🎰 Jeux Instantanés & Slots"
              : item === "draws"
                ? "🎟️ Tirages & Loterie"
                : item === "activity"
                  ? "📜 Historique"
                  : "🛡️ Équité & Preuves"}
          </button>
        ))}
      </nav>

      {error && (
        <div className="test-games-error" role="alert">
          <X size={16} />
          {error}
          <button
            className="icon-button"
            onClick={() => setError("")}
            aria-label={t("a11y.close")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="empty-note">
          <RefreshCw className="spin" size={16} />
          {t("testGames.loading")}
        </div>
      ) : tab === "instant" ? (
        <InstantSection
          games={games}
          selectedGameSlug={selectedGameSlug}
          onSelectGame={setSelectedGameSlug}
          playInstantAsync={playInstantAsync}
          lastPlay={lastPlay}
          onTriggerBigWin={(play) => setBigWinPlay(play)}
          action={action}
          t={t}
        />
      ) : tab === "draws" ? (
        <DrawSection
          draws={draws}
          selectedDraw={selectedDraw}
          setSelectedDraw={setSelectedDraw}
          selections={drawSelections}
          numbersFor={numbersFor}
          toggleNumber={toggleNumber}
          submitEntry={submitEntry}
          simulateDraw={simulateDraw}
          action={action}
          entries={entries}
          t={t}
        />
      ) : tab === "activity" ? (
        <ActivitySection plays={plays} entries={entries} t={t} />
      ) : (
        <FairnessSection />
      )}
    </div>
  );
}

function InstantSection({
  games,
  selectedGameSlug,
  onSelectGame,
  playInstantAsync,
  lastPlay,
  onTriggerBigWin,
  action,
  t,
}: {
  games: InstantGame[];
  selectedGameSlug: string;
  onSelectGame: (slug: string) => void;
  playInstantAsync: (game: InstantGame) => Promise<InstantPlay | null>;
  lastPlay: InstantPlay | null;
  onTriggerBigWin: (play: InstantPlay) => void;
  action: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const currentGame = games.find((g) => g.slug === selectedGameSlug) || games[0];

  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow gold">EXPÉRIENCE CASINO INTERACTIVE</span>
          <h2>Espace Jeux de Hasard</h2>
          <p className="section-lede">
            Sélectionnez une machine ou un mini-jeu pour lancer votre partie interactive.
          </p>
        </div>
        <span className="test-games-count">
          {games.length} {t("testGames.games")}
        </span>
      </div>

      {/* Game Switcher Pills */}
      <div className="casino-game-switcher" style={{ display: "flex", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        {games.map((g) => (
          <button
            key={g.slug}
            type="button"
            className={`button ${selectedGameSlug === g.slug ? "button-gold" : "button-outline"}`}
            onClick={() => onSelectGame(g.slug)}
            style={{ borderRadius: "20px", padding: "8px 18px", fontSize: "0.9rem", fontWeight: 700 }}
          >
            {g.game_type === "slots" ? "🎰 " : g.game_type === "wheel" ? "🎡 " : "🎁 "}
            {g.name}
          </button>
        ))}
      </div>

      {/* Active Interactive Game Component */}
      <div className="active-casino-stage" style={{ marginBottom: "32px" }}>
        {currentGame.game_type === "slots" ? (
          <SlotMachine
            cost={currentGame.cost}
            maxPrize={currentGame.max_prize}
            onSpin={() => playInstantAsync(currentGame)}
            disabled={Boolean(action && action !== currentGame.slug)}
            onWin={onTriggerBigWin}
          />
        ) : currentGame.game_type === "wheel" ? (
          <LuckyWheel
            onSpin={() => playInstantAsync(currentGame)}
            disabled={Boolean(action && action !== currentGame.slug)}
            onWin={onTriggerBigWin}
          />
        ) : (
          <MysteryChests
            cost={currentGame.cost}
            maxPrize={currentGame.max_prize}
            onPlay={() => playInstantAsync(currentGame)}
            disabled={Boolean(action && action !== currentGame.slug)}
            onWin={onTriggerBigWin}
          />
        )}
      </div>

      {/* Quick Access Game Cards Grid */}
      <div className="section-heading" style={{ marginTop: "30px" }}>
        <h3>Catalogue des Jeux Instantanés</h3>
      </div>
      <div className="test-game-grid">
        {games.map((game) => (
          <article
            className={`test-game-card test-game-${game.game_type} ${selectedGameSlug === game.slug ? "selected-card" : ""}`}
            key={game.slug}
            style={{ cursor: "pointer" }}
            onClick={() => onSelectGame(game.slug)}
          >
            <div className="test-game-card-top">
              <span className="test-game-icon">
                {game.game_type === "slots" ? "🎰" : game.game_type === "scratch" ? "🎁" : "🎡"}
              </span>
              <span className="test-game-tag">
                <i /> Jouer en direct
              </span>
            </div>
            <h3>{game.name}</h3>
            <p>
              {game.game_type === "slots"
                ? "Machine à sous 3 rouleaux avec multiplicateurs jusqu'à x50."
                : game.game_type === "scratch"
                  ? t("testGames.coffreBody")
                  : t("testGames.wheelBody")}
            </p>
            <div className="test-game-meta">
              <span>
                <Clock3 size={13} /> {t("testGames.quick")}
              </span>
              <span>
                <Trophy size={13} /> +{game.max_prize.toLocaleString("fr-FR")} SIM
              </span>
            </div>
            <button
              type="button"
              className="button button-gold full"
              onClick={(e) => {
                e.stopPropagation();
                onSelectGame(game.slug);
              }}
            >
              <Sparkles size={15} />
              {game.cost ? `Ouvrir le jeu · ${game.cost} SIM` : "Lancer le bonus (Gratuit)"}
            </button>
          </article>
        ))}
      </div>

      {lastPlay && <ResultCard play={lastPlay} t={t} />}
    </section>
  );
}

function ResultCard({
  play,
  t,
}: {
  play: InstantPlay;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-result-card" aria-live="polite" style={{ marginTop: "24px" }}>
      <div className="test-result-icon">
        <Check size={22} />
      </div>
      <div>
        <span className="eyebrow gold">{t("testGames.result")}</span>
        <h3>{play.result_label}</h3>
        <p>
          {play.prize
            ? `+${play.prize.toLocaleString("fr-FR")} SIM`
            : t("testGames.noPrize")}{" "}
          · {play.cost ? `${play.cost} SIM` : t("testGames.freeEntry")}
        </p>
        <small>
          Preuve d'audit SHA-256 : {play.audit.commitment?.slice(0, 24)}…
        </small>
      </div>
      <ShieldCheck size={21} />
    </section>
  );
}

function DrawSection({
  draws,
  selectedDraw,
  setSelectedDraw,
  numbersFor,
  toggleNumber,
  submitEntry,
  simulateDraw,
  action,
  entries,
  t,
}: {
  draws: TestDraw[];
  selectedDraw: string | null;
  setSelectedDraw: (value: string | null) => void;
  selections?: Record<string, number[]>;
  numbersFor: (draw: TestDraw) => number[];
  toggleNumber: (draw: TestDraw, number: number) => void;
  submitEntry: (draw: TestDraw) => Promise<void>;
  simulateDraw: (draw: TestDraw) => Promise<void>;
  action: string;
  entries: Array<{ draw_slug: string }>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("testGames.drawEyebrow")}</span>
          <h2>{t("testGames.drawTitle")}</h2>
          <p className="section-lede">{t("testGames.drawBody")}</p>
        </div>
        <span className="test-games-count">
          <Ticket size={14} /> {draws.length} {t("testGames.draws")}
        </span>
      </div>
      <div className="test-draws-grid">
        {draws.map((draw) => {
          const isSelected = selectedDraw === draw.slug;
          const userNumbers = numbersFor(draw);
          const requiredCount = draw.draw_type === "three_digits" ? 3 : 5;
          const maxNumber = draw.draw_type === "three_digits" ? 9 : 35;
          const ready = userNumbers.length === requiredCount;
          const userEntriesCount = entries.filter((e) => e.draw_slug === draw.slug).length;

          return (
            <article className="test-draw-card" key={draw.slug}>
              <div className="test-draw-card-header">
                <div>
                  <span className="test-draw-type">
                    {draw.draw_type === "three_digits" ? "Tirage 3 Chiffres" : "Grand Jackpot"}
                  </span>
                  <h3>{draw.name}</h3>
                </div>
                <span className={`status-badge ${draw.status}`}>
                  {draw.status === "open" ? "Ouvert" : "Tiré"}
                </span>
              </div>
              <div className="test-draw-meta-grid">
                <div>
                  <span>Coût par ticket</span>
                  <strong>{draw.entry_cost} SIM</strong>
                </div>
                <div>
                  <span>Clôture</span>
                  <strong>{new Date(draw.closes_at).toLocaleDateString("fr-FR")}</strong>
                </div>
                <div>
                  <span>Vos tickets</span>
                  <strong>{userEntriesCount} validé(s)</strong>
                </div>
              </div>

              {isSelected ? (
                <div className="draw-selector-box">
                  <h4>Choisissez {requiredCount} numéros :</h4>
                  <div className="draw-number-picker">
                    {Array.from({ length: maxNumber }, (_, i) => i + 1).map((num) => {
                      const active = userNumbers.includes(num);
                      return (
                        <button
                          key={num}
                          type="button"
                          className={`draw-ball ${active ? "active" : ""}`}
                          onClick={() => toggleNumber(draw, num)}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                  <div className="draw-picker-actions">
                    <button
                      type="button"
                      className="button button-gold"
                      disabled={!ready || Boolean(action)}
                      onClick={() => void submitEntry(draw)}
                    >
                      {action === draw.slug ? (
                        <RefreshCw className="spin" size={15} />
                      ) : (
                        <Ticket size={15} />
                      )}
                      Valider la grille ({draw.entry_cost} SIM)
                    </button>
                    <button
                      type="button"
                      className="button button-outline"
                      onClick={() => setSelectedDraw(null)}
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <div className="draw-card-actions">
                  <button
                    type="button"
                    className="button button-gold full"
                    onClick={() => setSelectedDraw(draw.slug)}
                    disabled={draw.status !== "open"}
                  >
                    <Ticket size={16} /> Remplir une grille
                  </button>
                  <button
                    type="button"
                    className="button button-outline full"
                    onClick={() => void simulateDraw(draw)}
                    disabled={Boolean(action)}
                    style={{ marginTop: "6px" }}
                  >
                    <Sparkles size={14} /> Simuler le tirage immédiat
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ActivitySection({
  plays,
  entries,
}: {
  plays: InstantPlay[];
  entries: Array<{
    entry_id: string;
    draw_slug: string;
    draw_name: string;
    numbers: number[];
    created_at: string;
  }>;
  t?: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow gold">HISTORIQUE DES SESSIONS</span>
          <h2>Votre Activité de Jeu</h2>
          <p className="section-lede">
            Retrouvez tous vos tirages, participations instantanées et gains enregistrés.
          </p>
        </div>
      </div>
      <div className="activity-lists-container">
        <div className="activity-block">
          <h3>🎰 Jeux Instantanés & Machines</h3>
          {plays.length === 0 ? (
            <p className="empty-note">Aucune partie instantanée jouée pour le moment.</p>
          ) : (
            <div className="plays-list">
              {plays.map((play) => (
                <div className="play-row" key={play.play_id}>
                  <div>
                    <strong>{play.result_label}</strong>
                    <small>{new Date(play.created_at).toLocaleString("fr-FR")}</small>
                  </div>
                  <div className={`play-prize ${play.prize > 0 ? "win" : "loss"}`}>
                    {play.prize > 0 ? `+${play.prize.toLocaleString("fr-FR")} SIM` : "0 SIM"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="activity-block" style={{ marginTop: "24px" }}>
          <h3>🎟️ Grilles de Loterie</h3>
          {entries.length === 0 ? (
            <p className="empty-note">Aucun ticket de tirage validé.</p>
          ) : (
            <div className="entries-list">
              {entries.map((entry) => (
                <div className="entry-row" key={entry.entry_id}>
                  <div>
                    <strong>{entry.draw_name}</strong>
                    <div className="entry-balls">
                      {entry.numbers.map((n) => (
                        <span key={n} className="mini-ball">{n}</span>
                      ))}
                    </div>
                  </div>
                  <small>{new Date(entry.created_at).toLocaleString("fr-FR")}</small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function FairnessSection() {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow gold">TRANSPARENCE & AUDIT</span>
          <h2>Équité Mathématique & Provably Fair</h2>
          <p className="section-lede">
            Comment nous garantissons que chaque tirage est 100% honnête, imprévisible et infalsifiable.
          </p>
        </div>
      </div>
      <div className="fairness-content-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "18px" }}>
        <div className="fairness-card" style={{ background: "#111726", padding: "20px", borderRadius: "16px", border: "1px solid #232e47" }}>
          <Sparkles size={24} className="gold-icon" />
          <h3 style={{ margin: "12px 0 6px" }}>Génération Cryptographique</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            Chaque résultat utilise la bibliothèque <code>secrets</code> basée sur l'entropie du système d'exploitation, assurant des probabilités rigoureusement conformes aux mathématiques du jeu.
          </p>
        </div>
        <div className="fairness-card" style={{ background: "#111726", padding: "20px", borderRadius: "16px", border: "1px solid #232e47" }}>
          <ShieldCheck size={24} className="gold-icon" />
          <h3 style={{ margin: "12px 0 6px" }}>Engagement SHA-256</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            Chaque tour génère une empreinte SHA-256 cryptographique immuable liée à votre identifiant et à la clé d'idempotence de la requête.
          </p>
        </div>
        <div className="fairness-card" style={{ background: "#111726", padding: "20px", borderRadius: "16px", border: "1px solid #232e47" }}>
          <Trophy size={24} className="gold-icon" />
          <h3 style={{ margin: "12px 0 6px" }}>Comptabilité Ledger Double-Entrée</h3>
          <p style={{ fontSize: "0.88rem", color: "var(--muted)" }}>
            Tous les débits de participation et tous les crédits de gains sont instantanément et définitivement scellés dans le grand livre de transactions.
          </p>
        </div>
      </div>
    </section>
  );
}
