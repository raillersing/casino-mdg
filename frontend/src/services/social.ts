export type ChatMessage = {
  id: number;
  author: string;
  body: string;
  created_at: string;
};

async function request<T>(
  path: string,
  accessToken: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api/v1/social/${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(options?.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.detail || "Action sociale impossible.");
  return payload as T;
}

export function getTableChat(tableId: string, accessToken: string) {
  return request<{ results: ChatMessage[] }>(
    `tables/${tableId}/chat/`,
    accessToken,
  );
}
export function sendTableMessage(
  tableId: string,
  body: string,
  accessToken: string,
) {
  return request<ChatMessage>(`tables/${tableId}/chat/`, accessToken, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}
export function createTableInvitation(tableId: string, accessToken: string) {
  return request<{ token: string; expires_at: string }>(
    `tables/${tableId}/invitations/`,
    accessToken,
    { method: "POST" },
  );
}

export function acceptTableInvitation(token: string, accessToken: string) {
  return request<{
    table_id: string;
    table_code?: string;
    seat_index?: number;
    created: boolean;
  }>(`invitations/${token}/accept/`, accessToken, { method: "POST" });
}

export type FriendItem = {
  friendship_id: number;
  id: number;
  display_name: string;
  avatar: string;
  level: number;
  is_online: boolean;
  current_table?: {
    id: string;
    name: string;
    game_type: string;
  } | null;
};

export type PendingFriendRequest = {
  friendship_id: number;
  id: number;
  display_name: string;
  avatar: string;
  created_at: string;
};

export type FriendsData = {
  friends: FriendItem[];
  pending_received: PendingFriendRequest[];
  pending_sent: PendingFriendRequest[];
};

export type DirectConversationItem = {
  id: string;
  other_user: {
    id: number;
    display_name: string;
    avatar: string;
    is_online: boolean;
  };
  last_message?: {
    body: string;
    sender_id: number;
    created_at: string;
  } | null;
  unread_count: number;
  updated_at: string;
};

export type DirectMessageItem = {
  id: string;
  sender_id: number;
  body: string;
  created_at: string;
};

export function getFriends(accessToken: string) {
  return request<FriendsData>("friends/", accessToken);
}

export function sendFriendRequest(target: string, accessToken: string) {
  return request<{ detail: string }>("friends/", accessToken, {
    method: "POST",
    body: JSON.stringify({ target }),
  });
}

export function respondFriendRequest(
  friendshipId: number,
  action: "accept" | "reject" | "block" | "unfriend",
  accessToken: string,
) {
  return request<{ detail: string }>(
    `friends/${friendshipId}/${action}/`,
    accessToken,
    { method: "POST" },
  );
}

export function inviteFriendToTable(
  friendId: number,
  tableId: string,
  accessToken: string,
) {
  return request<{
    token: string;
    table_id: string;
    friend_name: string;
    expires_at: string;
  }>(`friends/${friendId}/invite-table/`, accessToken, {
    method: "POST",
    body: JSON.stringify({ table_id: tableId }),
  });
}

export function getDirectConversations(accessToken: string) {
  return request<{ conversations: DirectConversationItem[] }>(
    "conversations/",
    accessToken,
  );
}

export function startDirectConversation(
  targetUserId: number,
  accessToken: string,
) {
  return request<{
    id: string;
    other_user: { id: number; display_name: string; avatar: string };
  }>("conversations/", accessToken, {
    method: "POST",
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
}

export function getDirectMessages(
  conversationId: string,
  accessToken: string,
) {
  return request<{ results: DirectMessageItem[] }>(
    `conversations/${conversationId}/messages/`,
    accessToken,
  );
}

export function sendDirectMessage(
  conversationId: string,
  body: string,
  accessToken: string,
) {
  return request<DirectMessageItem>(
    `conversations/${conversationId}/messages/`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    },
  );
}
