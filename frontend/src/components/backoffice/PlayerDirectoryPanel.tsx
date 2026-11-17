import { useCallback, useEffect, useState } from "react";
import {
  getBackofficePlayerDetail,
  getBackofficePlayers,
  type BackofficePlayer,
  type PlayerDetail,
} from "@/services/backofficePlayersSim";

export function PlayerDirectoryPanel({ token }: { token: string }) {
  const [query, setQuery] = useState("");
  const [players, setPlayers] = useState<BackofficePlayer[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (term: string) => {
      setBusy(true);
      setError("");
      try {
        const data = await getBackofficePlayers(token, term);
        setPlayers(data.results);
        setTotal(data.count);
        setSelected(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Recherche indisponible.",
        );
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load("");
  }, [load]);

  const openPlayer = async (id: number) => {
    setError("");
    try {
      setSelected(await getBackofficePlayerDetail(token, id));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Consultation détaillée interdite.",
      );
    }
  };

  return (
    <section className="activity-card" aria-labelledby="admin-players-title">
      <div className="section-heading compact">
        <div>
          <span className="eyebrow gold">Gestion des joueurs</span>
          <h2 id="admin-players-title">Répertoire & dossiers clients</h2>
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void load(query);
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
      >
        <input
          className="auth-name-field"
          aria-label="Rechercher un joueur"
          value={query}
          maxLength={120}
          placeholder="Pseudo, email ou téléphone..."
          onChange={(event) => setQuery(event.target.value)}
        />
        <button className="button button-gold" type="submit" disabled={busy}>
          {busy ? "Recherche..." : "Rechercher"}
        </button>
      </form>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
        {total} joueurs correspondants. Les données privées sont masquées aux
        opérateurs sans accès renforcé.
      </p>
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {players.length === 0 ? (
        <p>Aucun joueur trouvé.</p>
      ) : (
        <div style={{ display: "grid", gap: "8px" }}>
          {players.map((player) => (
            <div className="activity-row" key={player.id}>
              <div>
                <strong>{player.display_name}</strong>
                <span>
                  ID #{player.id} · {player.email} · {player.phone}
                </span>
                <small>
                  Email {player.email_verified ? "vérifié" : "non attesté"}
                  {" · "}Téléphone{" "}
                  {player.phone_verified ? "attesté" : "non attesté"}
                  {" · "}
                  {player.is_active ? "Actif" : "Suspendu"}
                  {" · "}KYC {player.kyc_level}
                </small>
              </div>
              <button
                className="button button-outline button-small"
                type="button"
                onClick={() => void openPlayer(player.id)}
              >
                Dossier
              </button>
            </div>
          ))}
        </div>
      )}
      {selected && (
        <div
          style={{ borderTop: "1px solid var(--line)", marginTop: "16px" }}
          aria-label="Dossier joueur"
        >
          <h3>Dossier de {selected.player.display_name}</h3>
          <p>
            Email vérifié : {selected.player.email || "Non"}
            {" · "}Téléphone : {selected.player.phone}
          </p>
          <strong>Soldes par devise (sans conversion)</strong>
          {selected.wallets.map((wallet) => (
            <p key={wallet.currency_code}>
              {wallet.currency_code} : {wallet.balance.toLocaleString("fr-FR")}
              {" · "}Réservé : {wallet.held_balance.toLocaleString("fr-FR")}
            </p>
          ))}
          <strong>Dernières transactions</strong>
          {selected.transactions.slice(0, 10).map((tx) => (
            <p key={tx.id}>
              {tx.type} : {tx.amount.toLocaleString("fr-FR")} {tx.currency}
              {" · "}
              {tx.status}
            </p>
          ))}
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
            Les soldes MGA présentés proviennent du registre interne ; ils ne
            prouvent pas à eux seuls un rapprochement bancaire.
          </p>
        </div>
      )}
    </section>
  );
}
