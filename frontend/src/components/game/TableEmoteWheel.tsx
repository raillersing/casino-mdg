import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Smile, MessageSquare, X, Clock } from "lucide-react";

interface TableEmoteWheelProps {
  onSend: (text: string) => void;
  onClose: () => void;
  cooldownSeconds?: number;
}

export function TableEmoteWheel({
  onSend,
  onClose,
  cooldownSeconds = 3,
}: TableEmoteWheelProps) {
  const { i18n } = useTranslation();
  const isMg = i18n.language.startsWith("mg");
  const [activeTab, setActiveTab] = useState<"emotes" | "mg" | "fr">(
    isMg ? "mg" : "emotes",
  );
  const [remainingCooldown, setRemainingCooldown] = useState(0);

  useEffect(() => {
    if (remainingCooldown <= 0) return;
    const interval = setInterval(() => {
      setRemainingCooldown((prev) => {
        if (prev <= 0.1) {
          clearInterval(interval);
          return 0;
        }
        return Math.max(0, +(prev - 0.1).toFixed(1));
      });
    }, 100);
    return () => clearInterval(interval);
  }, [remainingCooldown]);

  const handleSelect = (value: string) => {
    if (remainingCooldown > 0) return;
    onSend(value);
    setRemainingCooldown(cooldownSeconds);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([25]);
    }
  };

  const EMOTE_ITEMS = [
    { icon: "👏", label: isMg ? "Miarahaba" : "Bravo" },
    { icon: "🔥", label: isMg ? "Mirehitra" : "En feu" },
    { icon: "😂", label: isMg ? "Fihomehezana" : "Rire" },
    { icon: "🍀", label: isMg ? "Vintana" : "Chance" },
    { icon: "😱", label: isMg ? "Gaga" : "Choc" },
    { icon: "😎", label: isMg ? "Tsara tarehy" : "Cool" },
    { icon: "☕", label: isMg ? "Kafe" : "Pause" },
    { icon: "🤝", label: isMg ? "Mpirahalahy" : "Respect" },
    { icon: "🎯", label: isMg ? "Voa" : "Visé" },
    { icon: "💀", label: isMg ? "Resy" : "KO" },
    { icon: "🎉", label: isMg ? "Fety" : "Victoire" },
    { icon: "💔", label: isMg ? "Malahelo" : "Dommage" },
  ];

  const MG_PHRASES = [
    "Tsara lalao !",
    "Alefa !",
    "Misaotra betsaka !",
    "Andraso kely...",
    "May vola !",
    "Tsy maninona !",
    "Andao indray !",
    "Vintana madio !",
    "Efa ho avy !",
    "Tena mahay !",
  ];

  const FR_PHRASES = [
    "Bien joué !",
    "Bonne chance !",
    "Revanche ?",
    "Merci beaucoup !",
    "Un coup de maître !",
    "Désolé...",
    "GG",
    "À vous l'honneur !",
    "Bien tenté !",
    "Quelle partie !",
  ];

  return (
    <div
      className="table-emote-wheel-container"
      role="dialog"
      aria-label={isMg ? "Fihetsika sy teny fohy" : "Émotes et phrases rapides"}
    >
      <div className="table-emote-wheel-header">
        <div className="wheel-tabs-bar">
          <button
            type="button"
            className={`wheel-tab-btn ${activeTab === "emotes" ? "active" : ""}`}
            onClick={() => setActiveTab("emotes")}
          >
            <Smile size={14} />
            <span>{isMg ? "Sary" : "Émotes"}</span>
          </button>
          <button
            type="button"
            className={`wheel-tab-btn ${activeTab === "mg" ? "active" : ""}`}
            onClick={() => setActiveTab("mg")}
          >
            <MessageSquare size={14} />
            <span>🇲🇬 Malagasy</span>
          </button>
          <button
            type="button"
            className={`wheel-tab-btn ${activeTab === "fr" ? "active" : ""}`}
            onClick={() => setActiveTab("fr")}
          >
            <MessageSquare size={14} />
            <span>🇫🇷 Français</span>
          </button>
        </div>

        <div className="wheel-header-actions">
          {remainingCooldown > 0 && (
            <span className="wheel-cooldown-badge">
              <Clock size={12} />
              <span>{remainingCooldown.toFixed(1)}s</span>
            </span>
          )}
          <button
            type="button"
            className="wheel-close-btn"
            onClick={onClose}
            aria-label={isMg ? "Hakatona" : "Fermer"}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="table-emote-wheel-content">
        {activeTab === "emotes" && (
          <div className="wheel-emotes-grid">
            {EMOTE_ITEMS.map((item) => (
              <button
                key={item.icon}
                type="button"
                disabled={remainingCooldown > 0}
                className={`wheel-emote-card ${remainingCooldown > 0 ? "is-cooling" : ""}`}
                onClick={() => handleSelect(item.icon)}
                title={item.label}
              >
                <span className="wheel-emote-icon">{item.icon}</span>
                <span className="wheel-emote-label">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === "mg" && (
          <div className="wheel-phrases-list">
            {MG_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                disabled={remainingCooldown > 0}
                className={`wheel-phrase-btn ${remainingCooldown > 0 ? "is-cooling" : ""}`}
                onClick={() => handleSelect(phrase)}
              >
                {phrase}
              </button>
            ))}
          </div>
        )}

        {activeTab === "fr" && (
          <div className="wheel-phrases-list">
            {FR_PHRASES.map((phrase) => (
              <button
                key={phrase}
                type="button"
                disabled={remainingCooldown > 0}
                className={`wheel-phrase-btn ${remainingCooldown > 0 ? "is-cooling" : ""}`}
                onClick={() => handleSelect(phrase)}
              >
                {phrase}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="wheel-footer-hint">
        <small>
          {isMg
            ? "Mipoitra ho an'ny mpilalao rehetra avy hatrany ny fihetsika."
            : "L'émote ou la phrase apparaît au-dessus de votre siège en temps réel."}
        </small>
      </div>
    </div>
  );
}
