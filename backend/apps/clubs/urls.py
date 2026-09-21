from django.urls import path

from .views import (
    ClubEventCompleteView,
    ClubEventJoinView,
    ClubEventsView,
    ClubInvitationAcceptView,
    ClubInvitationView,
    ClubJoinView,
    ClubLeaderboardView,
    ClubListCreateView,
    ClubMembersView,
    ClubCertificationRequestView,
    ClubChatView,
    ClubLeagueLeaderboardView,
)

urlpatterns = [
    path("", ClubListCreateView.as_view(), name="club-list-create"),
    path("league/", ClubLeagueLeaderboardView.as_view(), name="club-league"),
    path("<uuid:club_id>/join/", ClubJoinView.as_view(), name="club-join"),
    path(
        "<uuid:club_id>/request-certification/",
        ClubCertificationRequestView.as_view(),
        name="club-request-certification",
    ),
    path("<uuid:club_id>/chat/", ClubChatView.as_view(), name="club-chat"),
    path(
        "<uuid:club_id>/invitations/",
        ClubInvitationView.as_view(),
        name="club-invitation",
    ),
    path("<uuid:club_id>/members/", ClubMembersView.as_view(), name="club-members"),
    path("<uuid:club_id>/events/", ClubEventsView.as_view(), name="club-events"),
    path(
        "<uuid:club_id>/leaderboard/",
        ClubLeaderboardView.as_view(),
        name="club-leaderboard",
    ),
    path(
        "events/<uuid:event_id>/join/",
        ClubEventJoinView.as_view(),
        name="club-event-join",
    ),
    path(
        "events/<uuid:event_id>/complete/",
        ClubEventCompleteView.as_view(),
        name="club-event-complete",
    ),
    path(
        "invitations/<uuid:token>/accept/",
        ClubInvitationAcceptView.as_view(),
        name="club-invitation-accept",
    ),
]
