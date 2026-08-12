from django.urls import path

from .views import TableChatView, TableInvitationAcceptView, TableInvitationView

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
]
