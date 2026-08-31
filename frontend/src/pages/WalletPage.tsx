import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Smartphone,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useGameStore } from "@stores/gameStore";
import {
  getWalletBalance,
  getWalletTransaction,
  getWalletTransactions,
  type WalletBalance,
  type WalletTransaction,
  type WalletTransactionDetail,
} from "@services/wallet";
import {
  getPaymentIntents,
  type PaymentIntent,
} from "@services/payments";
import { DepositModal } from "@components/wallet/DepositModal";
import { WithdrawalModal } from "@components/wallet/WithdrawalModal";

export function WalletPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"overview" | "history" | "intents">("overview");
  const [currencyFilter, setCurrencyFilter] = useState<string>("");
  const [balance, setBalance] = useState<WalletBalance | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTransaction, setSelectedTransaction] =
    useState<WalletTransactionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [isWithdrawalOpen, setIsWithdrawalOpen] = useState(false);

  const accessToken = useGameStore((state) => state.accessToken);
  const user = useGameStore((state) => state.user);

  const loadWalletData = () => {
    if (!accessToken) {
      setLoading(false);
      return;
    }
    Promise.all([
      getWalletBalance(accessToken),
      getWalletTransactions(accessToken, currencyFilter || undefined),
      getPaymentIntents(accessToken),
    ])
      .then(([wallet, history, paymentIntents]) => {
        setBalance(wallet);
        setTransactions(history.results);
        setIntents(paymentIntents.results);
      })
      .catch((requestError) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Impossible de charger le portefeuille.",
        ),
      )
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadWalletData();
  }, [accessToken, currencyFilter]);

  const openTransaction = async (transaction: WalletTransaction) => {
    if (!accessToken) return;
    setDetailLoading(true);
    setDetailError("");
    try {
      setSelectedTransaction(
        await getWalletTransaction(accessToken, transaction.id),
      );
    } catch {
      setDetailError(t("wallet.detailError"));
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="page-stack">
      <div className="page-title-row">
        <div>
          <span className="eyebrow">{t("wallet.title")}</span>
          <h1>{t("wallet.title")}</h1>
          <p>Gérez vos jetons de jeu et votre solde en Ariary réel via Mobile Money.</p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setIsWithdrawalOpen(true)}
            disabled={!balance || (balance.mga_balance || 0) < 1000}
          >
            <ArrowUpRight size={17} /> Retirer mes gains
          </button>
          <button
            type="button"
            className="button button-gold"
            onClick={() => setIsDepositOpen(true)}
          >
            <Smartphone size={17} /> Déposer (Mobile Money)
          </button>
        </div>
      </div>

      <div className="wallet-layout">
        <section>
          {/* Cartes de soldes */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "16px" }}>
            {/* Solde Ariary Réel */}
            <div className="balance-card" style={{ border: "1px solid rgba(211, 176, 107, 0.4)" }}>
              <div className="balance-top">
                <span>Solde Réel (Ariary)</span>
                <Smartphone size={18} color="var(--gold)" />
              </div>
              <strong style={{ color: "var(--gold)" }}>
                {loading ? (
                  <Loader2 className="spin" size={28} />
                ) : (
                  (balance?.mga_balance ?? 0).toLocaleString("fr-FR")
                )}{" "}
                <small>Ar</small>
              </strong>
              <div className="balance-footer">
                <span>
                  {balance?.mga_held_balance ? `Bloqué : ${balance.mga_held_balance.toLocaleString("fr-FR")} Ar` : "Disponible immédiatement"}
                </span>
                <span className="balance-up" style={{ color: "var(--gold)" }}>MGA</span>
              </div>
            </div>

            {/* Solde Simulation */}
            <div className="balance-card">
              <div className="balance-top">
                <span>Jetons Simulation</span>
                <WalletCards size={18} />
              </div>
              <strong>
                {loading ? (
                  <Loader2 className="spin" size={28} />
                ) : (
                  (balance?.balance ?? 0).toLocaleString("fr-FR")
                )}{" "}
                <small>SIM</small>
              </strong>
              <div className="balance-footer">
                <span>Mode entraînement</span>
                <span className="balance-up">SIM</span>
              </div>
            </div>
          </div>

          <div className="wallet-tabs">
            <button
              className={tab === "overview" ? "active" : ""}
              onClick={() => setTab("overview")}
            >
              {t("wallet.overview")}
            </button>
            <button
              className={tab === "history" ? "active" : ""}
              onClick={() => setTab("history")}
            >
              Historique Grand Livre ({transactions.length})
            </button>
            <button
              className={tab === "intents" ? "active" : ""}
              onClick={() => setTab("intents")}
            >
              Transactions Mobile Money ({intents.length})
            </button>
          </div>

          {error && <p className="auth-error">{error}</p>}

          {tab === "overview" && (
            <>
              <div className="section-heading compact">
                <div>
                  <span className="eyebrow">Opérateurs partenaires</span>
                  <h2>Paiements mobiles à Madagascar</h2>
                </div>
              </div>
              <div className="deposit-grid">
                <div
                  className="wallet-info-tile"
                  style={{ cursor: "pointer" }}
                  onClick={() => setIsDepositOpen(true)}
                >
                  <strong style={{ color: "#E5A800" }}>MVola</strong>
                  <small>Telma · #111#</small>
                </div>
                <div
                  className="wallet-info-tile"
                  style={{ cursor: "pointer" }}
                  onClick={() => setIsDepositOpen(true)}
                >
                  <strong style={{ color: "#FF7900" }}>Orange Money</strong>
                  <small>Orange · #144#</small>
                </div>
                <div
                  className="wallet-info-tile"
                  style={{ cursor: "pointer" }}
                  onClick={() => setIsDepositOpen(true)}
                >
                  <strong style={{ color: "#E60000" }}>Airtel Money</strong>
                  <small>Airtel · #436#</small>
                </div>
              </div>
            </>
          )}

          {tab === "history" && (
            <>
              <div style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
                <button
                  type="button"
                  className={`button button-sm ${currencyFilter === "" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setCurrencyFilter("")}
                >
                  Toutes devises
                </button>
                <button
                  type="button"
                  className={`button button-sm ${currencyFilter === "MGA" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setCurrencyFilter("MGA")}
                >
                  Ariary (MGA)
                </button>
                <button
                  type="button"
                  className={`button button-sm ${currencyFilter === "SIM" ? "button-primary" : "button-secondary"}`}
                  onClick={() => setCurrencyFilter("SIM")}
                >
                  Simulation (SIM)
                </button>
              </div>

              <div className="activity-card">
                {transactions.length ? (
                  transactions.map((item) => (
                    <ActivityRow
                      key={item.id}
                      transaction={item}
                      onClick={() => void openTransaction(item)}
                    />
                  ))
                ) : (
                  <div className="empty-wallet">
                    {t("wallet.noTransactions")}
                  </div>
                )}
              </div>
              {detailLoading && (
                <p className="secure-note">{t("wallet.loadingDetail")}</p>
              )}
              {detailError && <p className="auth-error">{detailError}</p>}
              {selectedTransaction && (
                <TransactionDetail
                  detail={selectedTransaction}
                  onClose={() => setSelectedTransaction(null)}
                  t={t}
                />
              )}
            </>
          )}

          {tab === "intents" && (
            <div className="activity-card">
              {intents.length ? (
                intents.map((item) => (
                  <div
                    key={item.id}
                    className="activity-row"
                    style={{ cursor: "default" }}
                  >
                    <span className={`activity-icon ${item.direction === "deposit" ? "positive" : ""}`}>
                      {item.direction === "deposit" ? <ArrowDownLeft /> : <ArrowUpRight />}
                    </span>
                    <div style={{ flex: 1 }}>
                      <strong>
                        {item.direction_display || item.direction} {item.provider_display || item.provider.toUpperCase()}
                      </strong>
                      <small style={{ display: "block", color: "var(--muted)" }}>
                        {item.phone_number ? `${item.phone_number} · ` : ""}
                        {new Date(item.created_at).toLocaleString("fr-FR")}
                        {item.provider_reference ? ` · Réf : ${item.provider_reference}` : ""}
                      </small>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <b className={item.direction === "deposit" ? "positive-text" : ""}>
                        {item.direction === "deposit" ? "+" : "−"} {item.amount.toLocaleString("fr-FR")} {item.currency}
                      </b>
                      <span
                        style={{
                          display: "block",
                          fontSize: "11px",
                          fontWeight: 600,
                          color:
                            item.status === "completed"
                              ? "var(--green)"
                              : item.status === "failed" || item.status === "cancelled"
                              ? "var(--red)"
                              : "var(--gold)",
                        }}
                      >
                        {item.status_display || item.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-wallet">Aucune transaction Mobile Money.</div>
              )}
            </div>
          )}
        </section>

        <aside className="wallet-aside">
          <div className="payment-card">
            <span className="eyebrow gold">
              <Zap size={13} /> Mobile Money Réel
            </span>
            <h3>Opérations instantanées</h3>
            <p>
              Rechargez votre compte de jeu et retirez vos gains directement sur votre numéro Telma, Orange ou Airtel.
            </p>
            <div className="payment-methods">
              <span>MVola</span>
              <span>Orange Money</span>
              <span>Airtel Money</span>
            </div>
            <button
              type="button"
              className="button button-gold full"
              onClick={() => setIsDepositOpen(true)}
              style={{ marginTop: "12px" }}
            >
              <Smartphone size={16} /> Effectuer un dépôt
            </button>
          </div>
          <div className="secure-note">
            <WalletCards size={18} />
            <div>
              <strong>Grand livre audité & sécurisé</strong>
              <span>Toutes les écritures comptables respectent le principe de partie double.</span>
            </div>
          </div>
        </aside>
      </div>

      <DepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
        token={accessToken}
        defaultPhone={user?.phone}
        onDepositSuccess={loadWalletData}
      />

      <WithdrawalModal
        isOpen={isWithdrawalOpen}
        onClose={() => setIsWithdrawalOpen(false)}
        token={accessToken}
        availableBalance={balance?.mga_balance || 0}
        defaultPhone={user?.phone}
        onWithdrawalSuccess={loadWalletData}
      />
    </div>
  );
}

function ActivityRow({
  transaction,
  onClick,
}: {
  transaction: WalletTransaction;
  onClick: () => void;
}) {
  const positive = transaction.direction === "credit";
  return (
    <button type="button" className="activity-row" onClick={onClick}>
      <span className={`activity-icon ${positive ? "positive" : ""}`}>
        {positive ? <ArrowDownLeft /> : <ArrowUpRight />}
      </span>
      <span>
        <strong>{transaction.description || transaction.type}</strong>
        <small>
          {new Date(transaction.created_at).toLocaleString("fr-FR")}
        </small>
      </span>
      <b className={positive ? "positive-text" : ""}>
        {positive ? "+" : "−"} {transaction.amount.toLocaleString("fr-FR")} {transaction.currency}
      </b>
    </button>
  );
}

function TransactionDetail({
  detail,
  onClose,
  t,
}: {
  detail: WalletTransactionDetail;
  onClose: () => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <section className="payment-card">
      <div className="chat-head">
        <strong>{t("wallet.details")}</strong>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label={t("a11y.close")}
        >
          <X size={16} />
        </button>
      </div>
      <p>
        {detail.description || detail.type} ·{" "}
        {detail.amount.toLocaleString("fr-FR")} {detail.currency}
      </p>
      <p className="secure-note">
        {t("wallet.transactionCode")}: {detail.transaction_code}
      </p>
      <h4>{t("wallet.ledgerEntries")}</h4>
      {detail.entries.map((entry, index) => (
        <div className="activity-row" key={`${entry.account_type}-${index}`}>
          <span>{t("wallet.account", { type: entry.account_type })}</span>
          <span>{entry.entry_type}</span>
          <b>
            {entry.amount.toLocaleString("fr-FR")} · {t("wallet.balanceAfter")}:{" "}
            {entry.balance_after.toLocaleString("fr-FR")}
          </b>
        </div>
      ))}
    </section>
  );
}
