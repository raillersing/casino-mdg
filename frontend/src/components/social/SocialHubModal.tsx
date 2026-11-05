import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Users,
  MessageSquare,
  UserPlus,
  Bell,
  X,
  Send,
  Check,
  UserMinus,
  Gamepad2,
  Clock,
  ArrowLeft,
  Search,
} from "lucide-react";
import {
  getFriends,
  sendFriendRequest,
  respondFriendRequest,
  getDirectConversations,
  startDirectConversation,
  getDirectMessages,
  sendDirectMessage,
  type FriendItem,
  type PendingFriendRequest,
  type DirectConversationItem,
  type DirectMessageItem,
} from "@services/social";
import { useGameStore } from "@stores/gameStore";

interface SocialHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentTableId?: string;
  onInviteFriend?: (friendId: number, friendName: string) => void;
}

export function SocialHubModal({
  isOpen,
  onClose,
  currentTableId,
  onInviteFriend,
}: SocialHubModalProps) {
  const { i18n } = useTranslation();
  const isMg = i18n.language.startsWith("mg");
  const user = useGameStore((state) => state.user);
  const accessToken = useGameStore((state) => state.accessToken);

  const [activeTab, setActiveTab] = useState<
    "friends" | "messages" | "requests" | "add"
  >("friends");
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [pendingReceived, setPendingReceived] = useState<
    PendingFriendRequest[]
  >([]);
  const [pendingSent, setPendingSent] = useState<PendingFriendRequest[]>([]);
  const [conversations, setConversations] = useState<DirectConversationItem[]>(
    [],
  );
  const [activeConv, setActiveConv] = useState<DirectConversationItem | null>(
    null,
  );
  const [activeMessages, setActiveMessages] = useState<DirectMessageItem[]>([]);
  const [messageText, setMessageText] = useState("");
  const [searchTarget, setSearchTarget] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load friends and pending requests
  const loadSocialData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await getFriends(accessToken);
      setFriends(data.friends);
      setPendingReceived(data.pending_received);
      setPendingSent(data.pending_sent);

      const convData = await getDirectConversations(accessToken);
      setConversations(convData.conversations);
    } catch (err) {
      console.warn("Failed to load social data:", err);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    void loadSocialData();
    const interval = setInterval(() => {
      void loadSocialData();
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, accessToken, loadSocialData]);

  // Load messages when an active conversation is open
  useEffect(() => {
    if (!isOpen || !accessToken || !activeConv) return;
    const fetchMsgs = async () => {
      try {
        const res = await getDirectMessages(activeConv.id, accessToken);
        setActiveMessages(res.results);
      } catch (err) {
        console.warn("Failed to load direct messages:", err);
      }
    };
    void fetchMsgs();
    const interval = setInterval(fetchMsgs, 2500);
    return () => clearInterval(interval);
  }, [isOpen, accessToken, activeConv]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (activeConv && activeMessages.length) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeMessages.length, activeConv]);

  if (!isOpen) return null;

  const handleSendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !searchTarget.trim()) return;
    setLoading(true);
    setActionNotice("");
    setActionError("");
    try {
      const res = await sendFriendRequest(searchTarget.trim(), accessToken);
      setActionNotice(res.detail || "Demande envoyée !");
      setSearchTarget("");
      void loadSocialData();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Impossible d'envoyer la demande.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleRespond = async (
    friendshipId: number,
    action: "accept" | "reject" | "unfriend",
  ) => {
    if (!accessToken) return;
    try {
      await respondFriendRequest(friendshipId, action, accessToken);
      void loadSocialData();
    } catch (err) {
      console.warn("Respond friend error:", err);
    }
  };

  const handleOpenConversation = async (friend: FriendItem) => {
    if (!accessToken) return;
    try {
      const res = await startDirectConversation(friend.id, accessToken);
      setActiveConv({
        id: res.id,
        other_user: {
          id: res.other_user.id,
          display_name: res.other_user.display_name,
          avatar: res.other_user.avatar,
          is_online: friend.is_online,
        },
        unread_count: 0,
        updated_at: new Date().toISOString(),
      });
      setActiveTab("messages");
    } catch (err) {
      console.warn("Start conversation error:", err);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accessToken || !activeConv || !messageText.trim()) return;
    const body = messageText.trim();
    setMessageText("");
    try {
      const sent = await sendDirectMessage(activeConv.id, body, accessToken);
      setActiveMessages((prev) => [...prev, sent]);
    } catch (err) {
      console.warn("Send direct message error:", err);
    }
  };

  const onlineFriendsCount = friends.filter((f) => f.is_online).length;
  const totalUnread = conversations.reduce(
    (acc, curr) => acc + curr.unread_count,
    0,
  );

  return (
    <div className="social-hub-backdrop" onClick={onClose}>
      <div
        className="social-hub-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={isMg ? "Toerana ifaneraserana" : "Espace Social & Amis"}
      >
        {/* Modal Header */}
        <div className="social-hub-header">
          <div className="social-hub-title-wrap">
            <Users size={20} className="social-header-icon" />
            <div>
              <h2>{isMg ? "Namana & Hafatra" : "Amis & Messagerie"}</h2>
              <span className="social-header-sub">
                {isMg
                  ? `${onlineFriendsCount} amin'ny ${friends.length} namana milalao`
                  : `${onlineFriendsCount}/${friends.length} amis connectés`}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="social-hub-close"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        {!activeConv && (
          <div className="social-hub-tabs">
            <button
              type="button"
              className={`social-tab-btn ${activeTab === "friends" ? "active" : ""}`}
              onClick={() => setActiveTab("friends")}
            >
              <Users size={15} />
              <span>{isMg ? "Namana" : "Amis"}</span>
              <span className="tab-counter-badge">{friends.length}</span>
            </button>

            <button
              type="button"
              className={`social-tab-btn ${activeTab === "messages" ? "active" : ""}`}
              onClick={() => setActiveTab("messages")}
            >
              <MessageSquare size={15} />
              <span>{isMg ? "Hafatra" : "Messages"}</span>
              {totalUnread > 0 && (
                <span className="tab-unread-badge">{totalUnread}</span>
              )}
            </button>

            <button
              type="button"
              className={`social-tab-btn ${activeTab === "requests" ? "active" : ""}`}
              onClick={() => setActiveTab("requests")}
            >
              <Bell size={15} />
              <span>{isMg ? "Fangatahana" : "Demandes"}</span>
              {pendingReceived.length > 0 && (
                <span className="tab-requests-badge">
                  {pendingReceived.length}
                </span>
              )}
            </button>

            <button
              type="button"
              className={`social-tab-btn ${activeTab === "add" ? "active" : ""}`}
              onClick={() => setActiveTab("add")}
            >
              <UserPlus size={15} />
              <span>{isMg ? "Hanampy" : "Ajouter"}</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="social-hub-body">
          {/* TAB 1: FRIENDS LIST */}
          {!activeConv && activeTab === "friends" && (
            <div className="social-friends-panel">
              {friends.length === 0 ? (
                <div className="social-empty-state">
                  <Users size={32} />
                  <p>
                    {isMg
                      ? "Mbola tsy manana namana voasoratra ianao."
                      : "Vous n'avez pas encore d'amis ajoutés."}
                  </p>
                  <button
                    type="button"
                    className="button button-small button-gold"
                    onClick={() => setActiveTab("add")}
                  >
                    <UserPlus size={14} />
                    <span>{isMg ? "Manasa namana" : "Ajouter des amis"}</span>
                  </button>
                </div>
              ) : (
                <div className="social-user-cards-list">
                  {friends.map((friend) => (
                    <div key={friend.id} className="social-user-card">
                      <div className="user-card-avatar-wrap">
                        <div className="user-card-avatar">
                          {friend.avatar ? (
                            <img
                              src={friend.avatar}
                              alt={friend.display_name}
                            />
                          ) : (
                            friend.display_name[0]?.toUpperCase() || "U"
                          )}
                        </div>
                        <span
                          className={`online-indicator-dot ${friend.is_online ? "online" : "offline"}`}
                        />
                      </div>

                      <div className="user-card-info">
                        <div className="user-card-name-row">
                          <strong>{friend.display_name}</strong>
                          <span className="user-level-tag">
                            Nv. {friend.level}
                          </span>
                        </div>
                        <div className="user-card-status-text">
                          {friend.current_table ? (
                            <span className="status-playing">
                              <Gamepad2 size={12} />
                              <span>{friend.current_table.name}</span>
                            </span>
                          ) : friend.is_online ? (
                            <span className="status-online">
                              {isMg ? "🟢 Amin'ny Internet" : "🟢 En ligne"}
                            </span>
                          ) : (
                            <span className="status-offline">
                              {isMg ? "⚪ Tsy eo" : "⚪ Hors-ligne"}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="user-card-actions">
                        <button
                          type="button"
                          className="user-action-btn btn-chat"
                          onClick={() => void handleOpenConversation(friend)}
                          title="Envoyer un message"
                        >
                          <MessageSquare size={14} />
                        </button>

                        {currentTableId && onInviteFriend && (
                          <button
                            type="button"
                            className="user-action-btn btn-invite"
                            onClick={() =>
                              onInviteFriend(friend.id, friend.display_name)
                            }
                            title="Inviter à cette table"
                          >
                            <Gamepad2 size={14} />
                          </button>
                        )}

                        <button
                          type="button"
                          className="user-action-btn btn-remove"
                          onClick={() =>
                            void handleRespond(friend.friendship_id, "unfriend")
                          }
                          title="Retirer des amis"
                        >
                          <UserMinus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: DIRECT MESSAGES (CONVERSATIONS LIST & CHAT VIEW) */}
          {activeTab === "messages" && (
            <div className="social-messages-panel">
              {activeConv ? (
                /* Active Direct Conversation View */
                <div className="direct-chat-view">
                  <div className="direct-chat-topbar">
                    <button
                      type="button"
                      className="chat-back-btn"
                      onClick={() => setActiveConv(null)}
                    >
                      <ArrowLeft size={16} />
                      <span>{isMg ? "Hiverina" : "Retour"}</span>
                    </button>
                    <div className="chat-recipient-info">
                      <strong>{activeConv.other_user.display_name}</strong>
                      <span className="recipient-status">
                        {activeConv.other_user.is_online
                          ? isMg
                            ? "🟢 En ligne"
                            : "🟢 En ligne"
                          : isMg
                            ? "⚪ Tsy eo"
                            : "⚪ Hors-ligne"}
                      </span>
                    </div>
                  </div>

                  <div className="direct-chat-messages-scroll">
                    {activeMessages.length === 0 ? (
                      <div className="direct-chat-empty">
                        <MessageSquare size={28} />
                        <p>
                          {isMg
                            ? "Manomboha resaka amin'i namana."
                            : "Démarrez la conversation avec votre ami."}
                        </p>
                      </div>
                    ) : (
                      activeMessages.map((msg) => {
                        const isMine =
                          String(msg.sender_id) === String(user?.id);
                        return (
                          <div
                            key={msg.id}
                            className={`dm-bubble-row ${isMine ? "is-mine" : "is-theirs"}`}
                          >
                            <div className="dm-bubble">
                              <p className="dm-text">{msg.body}</p>
                              <span className="dm-time">
                                {new Date(msg.created_at).toLocaleTimeString(
                                  i18n.language,
                                  {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  },
                                )}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form
                    onSubmit={(e) => void handleSendMessage(e)}
                    className="direct-chat-input-bar"
                  >
                    <input
                      type="text"
                      placeholder={
                        isMg ? "Manorata hafatra..." : "Écrivez un message..."
                      }
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      maxLength={1000}
                    />
                    <button
                      type="submit"
                      disabled={!messageText.trim()}
                      className="dm-send-btn"
                      aria-label="Envoyer"
                    >
                      <Send size={16} />
                    </button>
                  </form>
                </div>
              ) : (
                /* Conversations List */
                <div className="conversations-list-view">
                  {conversations.length === 0 ? (
                    <div className="social-empty-state">
                      <MessageSquare size={32} />
                      <p>
                        {isMg
                          ? "Tsy misy hafatra voaray na nalefa."
                          : "Aucune conversation active pour le moment."}
                      </p>
                    </div>
                  ) : (
                    <div className="conversations-items-scroll">
                      {conversations.map((conv) => (
                        <div
                          key={conv.id}
                          className="conv-item-card"
                          onClick={() => setActiveConv(conv)}
                        >
                          <div className="user-card-avatar-wrap">
                            <div className="user-card-avatar">
                              {conv.other_user.display_name[0]?.toUpperCase() ||
                                "U"}
                            </div>
                            <span
                              className={`online-indicator-dot ${conv.other_user.is_online ? "online" : "offline"}`}
                            />
                          </div>

                          <div className="conv-card-body">
                            <div className="conv-card-top">
                              <strong>{conv.other_user.display_name}</strong>
                              {conv.last_message && (
                                <span className="conv-time">
                                  {new Date(
                                    conv.last_message.created_at,
                                  ).toLocaleTimeString(i18n.language, {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="conv-snippet">
                              {conv.last_message?.body ||
                                (isMg
                                  ? "Hafatra vaovao"
                                  : "Nouvelle discussion")}
                            </p>
                          </div>

                          {conv.unread_count > 0 && (
                            <span className="conv-unread-pill">
                              {conv.unread_count}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REQUESTS PENDING */}
          {!activeConv && activeTab === "requests" && (
            <div className="social-requests-panel">
              <div className="requests-section">
                <h4>
                  {isMg ? "Fangatahana voaray" : "Demandes reçues"} (
                  {pendingReceived.length})
                </h4>
                {pendingReceived.length === 0 ? (
                  <p className="section-empty-hint">
                    {isMg
                      ? "Tsy misy fangatahana vaovao."
                      : "Aucune demande en attente."}
                  </p>
                ) : (
                  <div className="social-user-cards-list">
                    {pendingReceived.map((req) => (
                      <div key={req.friendship_id} className="social-user-card">
                        <div className="user-card-avatar-wrap">
                          <div className="user-card-avatar">
                            {req.display_name[0]?.toUpperCase() || "U"}
                          </div>
                        </div>
                        <div className="user-card-info">
                          <strong>{req.display_name}</strong>
                          <span className="request-time-ago">
                            <Clock size={11} />
                            <span>
                              {new Date(req.created_at).toLocaleDateString(
                                i18n.language,
                              )}
                            </span>
                          </span>
                        </div>
                        <div className="user-card-actions">
                          <button
                            type="button"
                            className="request-btn-accept"
                            onClick={() =>
                              void handleRespond(req.friendship_id, "accept")
                            }
                          >
                            <Check size={14} />
                            <span>{isMg ? "Eny" : "Accepter"}</span>
                          </button>
                          <button
                            type="button"
                            className="request-btn-reject"
                            onClick={() =>
                              void handleRespond(req.friendship_id, "reject")
                            }
                          >
                            <X size={14} />
                            <span>{isMg ? "Tsia" : "Refuser"}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {pendingSent.length > 0 && (
                <div className="requests-section mt-4">
                  <h4>
                    {isMg ? "Fangatahana nalefa" : "Demandes envoyées"} (
                    {pendingSent.length})
                  </h4>
                  <div className="social-user-cards-list">
                    {pendingSent.map((req) => (
                      <div
                        key={req.friendship_id}
                        className="social-user-card dim"
                      >
                        <div className="user-card-avatar-wrap">
                          <div className="user-card-avatar">
                            {req.display_name[0]?.toUpperCase() || "U"}
                          </div>
                        </div>
                        <div className="user-card-info">
                          <strong>{req.display_name}</strong>
                          <span className="sent-pending-tag">
                            {isMg ? "Miandry valiny…" : "En attente…"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ADD FRIEND */}
          {!activeConv && activeTab === "add" && (
            <div className="social-add-panel">
              <form
                onSubmit={(e) => void handleSendRequest(e)}
                className="add-friend-form"
              >
                <label>
                  <span>
                    {isMg
                      ? "Ampidiro ny anaran'ny mpilalao na laharana finday"
                      : "Entrez le pseudo ou le numéro du joueur"}
                  </span>
                  <div className="add-input-wrap">
                    <Search size={16} className="add-input-icon" />
                    <input
                      type="text"
                      placeholder="Ex: Rija, Tantely, +261..."
                      value={searchTarget}
                      onChange={(e) => setSearchTarget(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      disabled={loading || !searchTarget.trim()}
                      className="button button-gold"
                    >
                      <UserPlus size={15} />
                      <span>{isMg ? "Alefa" : "Ajouter"}</span>
                    </button>
                  </div>
                </label>
              </form>

              {actionNotice && (
                <div className="social-alert-notice">
                  <Check size={16} />
                  <span>{actionNotice}</span>
                </div>
              )}

              {actionError && (
                <div className="social-alert-error">
                  <X size={16} />
                  <span>{actionError}</span>
                </div>
              )}

              <div className="add-friend-tips">
                <h5>💡 {isMg ? "Toro-hevitra" : "Conseil de jeu"}</h5>
                <p>
                  {isMg
                    ? "Azonao asaina avy hatrany amin'ny latabatra lalao ny namanao rehefa milalao ianao."
                    : "Une fois amis, vous pourrez vous inviter mutuellement en 1 clic sur vos tables de Belote, Poker, Tsitson et Rami !"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
