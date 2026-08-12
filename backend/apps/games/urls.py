from django.urls import path

from .views import (
    DailyMissionsView,
    GameLeaderboardView,
    GameResultCreateView,
    MatchmakingCancelView,
    MatchmakingHeartbeatView,
    MatchmakingQueueView,
    MatchmakingStatusView,
    TableJoinView,
    TableListCreateView,
    TestDrawEntryView,
    TestDrawListView,
    TestDrawResultView,
    TestGamesActivityView,
    TestGamesCatalogView,
    TestInstantPlayView,
)

urlpatterns = [
    path("tables/", TableListCreateView.as_view(), name="table-list-create"),
    path("tables/<uuid:table_id>/join/", TableJoinView.as_view(), name="table-join"),
    path(
        "matchmaking/status/",
        MatchmakingStatusView.as_view(),
        name="matchmaking-status",
    ),
    path(
        "matchmaking/heartbeat/",
        MatchmakingHeartbeatView.as_view(),
        name="matchmaking-heartbeat",
    ),
    path(
        "matchmaking/queue/", MatchmakingQueueView.as_view(), name="matchmaking-queue"
    ),
    path(
        "matchmaking/queue/<uuid:ticket_id>/",
        MatchmakingCancelView.as_view(),
        name="matchmaking-cancel",
    ),
    path("results/", GameResultCreateView.as_view(), name="game-result"),
    path("leaderboard/", GameLeaderboardView.as_view(), name="game-leaderboard"),
    path("missions/", DailyMissionsView.as_view(), name="daily-missions"),
    path(
        "test-games/catalog/", TestGamesCatalogView.as_view(), name="test-games-catalog"
    ),
    path(
        "test-games/<slug:slug>/plays/",
        TestInstantPlayView.as_view(),
        name="test-instant-play",
    ),
    path(
        "test-games/activity/",
        TestGamesActivityView.as_view(),
        name="test-games-activity",
    ),
    path("test-draws/", TestDrawListView.as_view(), name="test-draw-list"),
    path(
        "test-draws/<slug:slug>/entries/",
        TestDrawEntryView.as_view(),
        name="test-draw-entry",
    ),
    path(
        "test-draws/<slug:slug>/result/",
        TestDrawResultView.as_view(),
        name="test-draw-result",
    ),
]
