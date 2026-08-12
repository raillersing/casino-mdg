from django.urls import path

from .views import (
    ClubInvitationAcceptView,
    ClubInvitationView,
    ClubJoinView,
    ClubListCreateView,
)

urlpatterns = [
    path("", ClubListCreateView.as_view(), name="club-list-create"),
    path("<uuid:club_id>/join/", ClubJoinView.as_view(), name="club-join"),
    path(
        "<uuid:club_id>/invitations/",
        ClubInvitationView.as_view(),
        name="club-invitation",
    ),
    path(
        "invitations/<uuid:token>/accept/",
        ClubInvitationAcceptView.as_view(),
        name="club-invitation-accept",
    ),
]
