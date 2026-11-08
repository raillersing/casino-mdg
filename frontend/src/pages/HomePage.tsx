import { useEffect, useState } from "react";
import { useGameStore } from "@stores/gameStore";
import { LiveStatsTicker } from "@components/game/LiveStatsTicker";
import { Link } from "react-router-dom";
import { ArrowRight, Users, Bot, Compass, KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();
  const token = useGameStore((state) => state.accessToken);
  const [resumable, setResumable] = useState<
    Array<{ id: string; table_code: string; game_type: string; name: string }>
  >([]);
  useEffect(() => {
    setResumable([]);
    if (!token) return;
    const controller = new AbortController();
    fetch("/api/v1/games/resumable/", {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => setResumable(data.results))
      .catch(() => undefined);
    return () => controller.abort();
  }, [token]);
  const actions = [
    { key: "online", icon: Compass, to: "/lobby" },
    { key: "friends", icon: Users, to: "/lobby?action=create" },
    { key: "practice", icon: Bot, to: "/games?intent=practice" },
  ];
  return (
    <div className="club-home">
      <section className="club-home-hero" aria-labelledby="home-title">
        <img
          src="/images/games/belote-cover.webp"
          alt=""
          width="960"
          height="640"
        />
        <div className="club-home-hero-copy">
          <span className="eyebrow">MDG GAME CLUB</span>
          <h1 id="home-title">{t("welcome.title")}</h1>
          <p>{t("welcome.intro")}</p>
          <div className="club-home-actions">
            <Link className="button button-gold" to="/games">
              {t("welcome.choose")} <ArrowRight size={18} />
            </Link>
            <Link
              className="button button-secondary"
              to="/lobby?action=join-private"
            >
              <KeyRound size={17} />
              {t("welcome.join")}
            </Link>
          </div>
        </div>
      </section>
      {resumable.length > 0 && (
        <section aria-label={t("welcome.resume")}>
          <h2>{t("welcome.resume")}</h2>
          {resumable.map((table) => (
            <Link
              className="button button-gold"
              key={table.id}
              to={`/game/${table.game_type}/${table.table_code}`}
            >
              {table.name} <ArrowRight size={16} />
            </Link>
          ))}
        </section>
      )}
      <LiveStatsTicker />
      <section aria-labelledby="home-intents">
        <h2 id="home-intents">{t("welcome.how")}</h2>
        <div className="club-home-intents">
          {actions.map(({ key, icon: Icon, to }) => (
            <Link to={to} key={key}>
              <Icon size={25} />
              <h3>{t(`welcome.${key}`)}</h3>
              <p>{t(`welcome.${key}Desc`)}</p>
              <ArrowRight size={18} />
            </Link>
          ))}
        </div>
      </section>
      <section aria-labelledby="home-discover">
        <div className="discovery-section-head">
          <h2 id="home-discover">{t("welcome.discover")}</h2>
          <Link to="/games" className="text-link">
            {t("discovery.allGames")} <ArrowRight size={16} />
          </Link>
        </div>
        <div className="club-home-featured">
          {[
            ["ludo", "Ludo Mada"],
            ["domino", "Domino Double-Six"],
          ].map(([id, name]) => (
            <Link to={`/lobby/${id}`} key={id}>
              <img
                src={`/images/games/${id}-cover.webp`}
                alt=""
                width="960"
                height="640"
                loading="lazy"
              />
              <div>
                <h3>{name}</h3>
                <span>
                  {t("welcome.discoverGame")} <ArrowRight size={16} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
      <aside className="club-home-help" aria-label={t("welcome.helpTitle")}>
        <h2>{t("welcome.helpTitle")}</h2>
        <p>{t("welcome.help")}</p>
        <Link to="/support" className="text-link">
          {t("welcome.support")} <ArrowRight size={16} />
        </Link>
      </aside>
    </div>
  );
}
