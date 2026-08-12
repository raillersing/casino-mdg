from django.urls import path

from .views import (
    ClubInvitationAcceptView,
    ClubInvitationView,
    ClubJoinView,
    ClubListCreateView,
    ClubMembersView,
)

urlpatterns = [
    path("", ClubListCreateView.as_view(), name="club-list-create"),
    path("<uuid:club_id>/join/", ClubJoinView.as_view(), name="club-join"),
    path(
        "<uuid:club_id>/invitations/",
        ClubInvitationView.as_view(),
        name="club-invitation",
    ),
    path("<uuid:club_id>/members/", ClubMembersView.as_view(), name="club-members"),
    path(
        "invitations/<uuid:token>/accept/",
        ClubInvitationAcceptView.as_view(),
        name="club-invitation-accept",
    ),
]
