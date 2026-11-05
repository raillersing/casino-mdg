from django.urls import path

from .views import (
    DirectConversationListView,
    DirectConversationMessagesView,
    FriendshipActionView,
    FriendshipListView,
    FriendTableInviteView,
    TableChatView,
    TableInvitationAcceptView,
    TableInvitationView,
)

urlpatterns = [
    path("tables/<uuid:table_id>/chat/", TableChatView.as_view(), name="table-chat"),
    path(
        "tables/<uuid:table_id>/invitations/",
        TableInvitationView.as_view(),
        name="table-invitation",
    ),
    path(
        "invitations/<uuid:token>/accept/",
        TableInvitationAcceptView.as_view(),
        name="table-invitation-accept",
    ),
    # Système d'Amis
    path("friends/", FriendshipListView.as_view(), name="friendship-list"),
    path(
        "friends/<int:friend_id>/invite-table/",
        FriendTableInviteView.as_view(),
        name="friend-table-invite",
    ),
    path(
        "friends/<int:friendship_id>/<str:action>/",
        FriendshipActionView.as_view(),
        name="friendship-action",
    ),
    # Messagerie Directe 1-à-1
    path(
        "conversations/",
        DirectConversationListView.as_view(),
        name="direct-conversation-list",
    ),
    path(
        "conversations/<uuid:conversation_id>/messages/",
        DirectConversationMessagesView.as_view(),
        name="direct-conversation-messages",
    ),
]
