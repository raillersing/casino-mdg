import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Check,
  ChevronRight,
  HelpCircle,
  Clock3,
  Dices,
  Eye,
  LockKeyhole,
  Pause,
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

type Tab = "instant" | "draws" | "activity" | "fairness";

const DEFAULT_GAMES: InstantGame[] = [
  {
    slug: "coffre-mada",
    name: "Coffre Mada",
    game_type: "scratch",
    version: "v1",
    cost: 100,
    max_prize: 10000,
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
    max_prize: 5000,
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
    entry_cost: 500,
    closes_at: new Date(Date.now() + 86400000 * 7).toISOString(),
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
  const [drawSelections, setDrawSelections] = useState<
    Record<string, number[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [lastPlay, setLastPlay] = useState<InstantPlay | null>(null);

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
      setGames(catalog.results);
      setDraws(drawList.results);
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

  const runGame = async (game: InstantGame) => {
    setAction(game.slug);
    setError("");
    const token = await ensureToken();
    if (!token) {
      setAction("");
      return;
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
    } catch (reason) {
      if (reason instanceof Error && reason.message === "AUTH_REQUIRED") {
        useGameStore.getState().logout();
        setError(t("testGames.sessionExpired"));
      } else {
        setError(
          reason instanceof Error ? reason.message : t("testGames.playError"),
        );
      }
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
      <section className="test-games-hero">
        <div>
          <span className="eyebrow gold">
            <Sparkles size={13} /> {t("testGames.simulation")}
          </span>
          <h1>
            {t("testGames.title")}
            <br />
            <em>{t("testGames.titleAccent")}</em>
          </h1>
          <p>{t("testGames.intro")}</p>
          <div className="test-games-hero-actions">
            <button
              className="button button-gold"
              onClick={() => changeTab("instant")}
            >
              <Dices size={16} /> {t("testGames.playNow")}
            </button>
            <button
              className="button button-outline"
              onClick={() => changeTab("draws")}
            >
              <Ticket size={16} /> {t("testGames.nextDraw")}
            </button>
          </div>
        </div>
        <div className="test-games-balance">
          <span>{t("testGames.simBalance")}</span>
          <strong>
            {balance?.balance.toLocaleString("fr-FR") || "—"} <small>SIM</small>
          </strong>
          <span className="test-games-status">
            <i /> {t("testGames.noRealMoney")}
          </span>
        </div>
      </section>
      <div className="test-games-notice">
        <ShieldCheck size={17} />
        <span>
          <strong>{t("testGames.fairTitle")}</strong> {t("testGames.fairBody")}
        </span>
        <button className="text-link" onClick={() => changeTab("fairness")}>
          {t("testGames.learnMore")} <ChevronRight size={14} />
        </button>
      </div>
      <nav className="test-games-tabs" aria-label={t("testGames.tabsLabel")}>
        {(["instant", "draws", "activity", "fairness"] as Tab[]).map((item) => (
          <button
            key={item}
            className={tab === item ? "active" : ""}
            onClick={() => changeTab(item)}
          >
            {t(`testGames.tabs.${item}`)}
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
          action={action}
          lastPlay={lastPlay}
          runGame={runGame}
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
        <FairnessSection t={t} />
      )}
    </div>
  );
}

function InstantSection({
  games,
  action,
  lastPlay,
  runGame,
  t,
}: {
  games: InstantGame[];
  action: string;
  lastPlay: InstantPlay | null;
  runGame: (game: InstantGame) => Promise<void>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("testGames.instantEyebrow")}</span>
          <h2>{t("testGames.instantTitle")}</h2>
          <p className="section-lede">{t("testGames.instantBody")}</p>
        </div>
        <span className="test-games-count">
          {games.length} {t("testGames.games")}
        </span>
      </div>
      <div className="test-game-grid">
        {games.map((game) => (
          <article
            className={`test-game-card test-game-${game.game_type}`}
            key={game.slug}
          >
            <div className="test-game-card-top">
              <span className="test-game-icon">
                {game.game_type === "scratch" ? "▦" : "◌"}
              </span>
              <span className="test-game-tag">
                <i /> {t("testGames.playable")}
              </span>
            </div>
            <h3>{game.name}</h3>
            <p>
              {game.game_type === "scratch"
                ? t("testGames.coffreBody")
                : t("testGames.wheelBody")}
            </p>
            <div className="test-game-meta">
              <span>
                <Clock3 size={13} /> {t("testGames.quick")}
              </span>
              <span>
                <Trophy size={13} /> +{game.max_prize.toLocaleString("fr-FR")}{" "}
                SIM
              </span>
            </div>
            <button
              className="button button-gold full"
              onClick={() => void runGame(game)}
              disabled={Boolean(action)}
            >
              {action === game.slug ? (
                <RefreshCw className="spin" size={15} />
              ) : (
                <Sparkles size={15} />
              )}{" "}
              {action === game.slug
                ? t("testGames.playing")
                : game.cost
                  ? `${t("testGames.play")} · ${game.cost} SIM`
                  : t("testGames.bonusPlay")}
            </button>
            <button className="test-rules-link" onClick={() => undefined}>
              <HelpCircle size={14} /> {t("testGames.rules")}
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
    <section className="test-result-card" aria-live="polite">
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
          {t("testGames.audit")}: {play.audit.commitment?.slice(0, 16)}…
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
  selections: Record<string, number[]>;
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
      <div className="draw-list">
        {draws.map((draw) => {
          const chosen = numbersFor(draw);
          const entryExists = entries.some(
            (entry) => entry.draw_slug === draw.slug,
          );
          return (
            <article className="draw-card" key={draw.slug}>
              <div className="draw-card-main">
                <div className="draw-card-heading">
                  <span className="draw-icon">
                    <Ticket size={19} />
                  </span>
                  <div>
                    <span className={`draw-status ${draw.status}`}>
                      {draw.status === "open"
                        ? t("testGames.open")
                        : draw.status === "drawn"
                          ? t("testGames.drawn")
                          : t("testGames.closed")}
                    </span>
                    <h3>{draw.name}</h3>
                  </div>
                </div>
                <p>
                  {draw.draw_type === "three_digits"
                    ? t("testGames.threeDigitsBody")
                    : t("testGames.jackpotBody")}
                </p>
                <div className="draw-meta">
                  <span>
                    <Clock3 size={13} />{" "}
                    {new Date(draw.closes_at).toLocaleString("fr-FR")}
                  </span>
                  <span>
                    {draw.entry_cost} SIM ·{" "}
                    {entryExists
                      ? t("testGames.entrySaved")
                      : t("testGames.entryAvailable")}
                  </span>
                </div>
                {draw.result && (
                  <div className="draw-result-numbers">
                    {draw.result.numbers.map((number, index) => (
                      <b key={`${number}-${index}`}>{number}</b>
                    ))}
                  </div>
                )}
              </div>
              <div className="draw-card-actions">
                {draw.status === "open" && (
                  <button
                    className="button button-gold"
                    onClick={() =>
                      setSelectedDraw(
                        selectedDraw === draw.slug ? null : draw.slug,
                      )
                    }
                  >
                    {selectedDraw === draw.slug
                      ? t("testGames.closeSelection")
                      : t("testGames.chooseNumbers")}
                  </button>
                )}
                {draw.status === "open" && draw.can_simulate && (
                  <button
                    className="test-secondary-button"
                    onClick={() => void simulateDraw(draw)}
                    disabled={Boolean(action)}
                  >
                    {action === `draw:${draw.slug}`
                      ? t("testGames.drawing")
                      : t("testGames.simulateResult")}
                  </button>
                )}
                {draw.result && (
                  <button className="test-secondary-button">
                    <Eye size={14} /> {t("testGames.viewProof")}
                  </button>
                )}
              </div>
              {selectedDraw === draw.slug && (
                <div className="draw-selector">
                  <strong>{t("testGames.yourSelection")}</strong>
                  <div className="number-grid">
                    {Array.from(
                      { length: draw.draw_type === "three_digits" ? 10 : 35 },
                      (_, index) => (
                        <button
                          key={index}
                          className={
                            chosen.includes(
                              draw.draw_type === "five_numbers"
                                ? index + 1
                                : index,
                            )
                              ? "selected"
                              : ""
                          }
                          onClick={() =>
                            toggleNumber(
                              draw,
                              draw.draw_type === "five_numbers"
                                ? index + 1
                                : index,
                            )
                          }
                          aria-pressed={chosen.includes(
                            draw.draw_type === "five_numbers"
                              ? index + 1
                              : index,
                          )}
                        >
                          {draw.draw_type === "five_numbers"
                            ? index + 1
                            : index}
                        </button>
                      ),
                    )}
                  </div>
                  <div className="draw-selection-footer">
                    <span>
                      {chosen.join(" · ") || t("testGames.noSelection")}
                    </span>
                    <button
                      className="button button-gold"
                      onClick={() => void submitEntry(draw)}
                      disabled={
                        Boolean(action) ||
                        (draw.draw_type === "three_digits"
                          ? chosen.length !== 3
                          : chosen.length !== 5)
                      }
                    >
                      {action === draw.slug
                        ? t("testGames.saving")
                        : t("testGames.confirmEntry")}
                    </button>
                  </div>
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
  t,
}: {
  plays: InstantPlay[];
  entries: Array<{
    entry_id: string;
    draw_slug: string;
    draw_name: string;
    numbers: number[];
    created_at: string;
  }>;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("testGames.activityEyebrow")}</span>
          <h2>{t("testGames.activityTitle")}</h2>
          <p className="section-lede">{t("testGames.activityBody")}</p>
        </div>
      </div>
      <div className="test-activity-grid">
        <div className="activity-card">
          <div className="chat-head">
            <strong>{t("testGames.instantHistory")}</strong>
          </div>
          {plays.length ? (
            plays.map((play) => (
              <div className="activity-row" key={play.play_id}>
                <span className="activity-icon positive">
                  <Sparkles size={14} />
                </span>
                <span>
                  <strong>{play.game_slug}</strong>
                  <small>
                    {play.result_label} ·{" "}
                    {new Date(play.created_at).toLocaleString("fr-FR")}
                  </small>
                </span>
                <b className={play.prize ? "positive-text" : ""}>
                  {play.prize ? `+${play.prize}` : "0"} SIM
                </b>
              </div>
            ))
          ) : (
            <div className="empty-wallet">{t("testGames.emptyActivity")}</div>
          )}
        </div>
        <div className="activity-card">
          <div className="chat-head">
            <strong>{t("testGames.drawHistory")}</strong>
          </div>
          {entries.length ? (
            entries.map((entry) => (
              <div className="activity-row" key={entry.entry_id}>
                <span className="activity-icon">
                  <Ticket size={14} />
                </span>
                <span>
                  <strong>{entry.draw_name}</strong>
                  <small>
                    {entry.numbers.join(" · ")} ·{" "}
                    {new Date(entry.created_at).toLocaleString("fr-FR")}
                  </small>
                </span>
                <b>{t("testGames.confirmed")}</b>
              </div>
            ))
          ) : (
            <div className="empty-wallet">{t("testGames.emptyEntries")}</div>
          )}
        </div>
      </div>
    </section>
  );
}

function FairnessSection({
  t,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="test-games-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t("testGames.fairEyebrow")}</span>
          <h2>{t("testGames.fairHeading")}</h2>
          <p className="section-lede">{t("testGames.fairIntro")}</p>
        </div>
      </div>
      <div className="fairness-grid">
        <div className="fairness-card">
          <ShieldCheck size={20} />
          <h3>{t("testGames.serverResult")}</h3>
          <p>{t("testGames.serverResultBody")}</p>
        </div>
        <div className="fairness-card">
          <LockKeyhole size={20} />
          <h3>{t("testGames.ledgerTitle")}</h3>
          <p>{t("testGames.ledgerBody")}</p>
        </div>
        <div className="fairness-card">
          <Pause size={20} />
          <h3>{t("testGames.pauseTitle")}</h3>
          <p>{t("testGames.pauseBody")}</p>
        </div>
      </div>
    </section>
  );
}
