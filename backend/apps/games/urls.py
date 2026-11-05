from django.urls import path

from .statistics_views import ConfirmHumanActivityView, UniquePlayerStatisticsView
from .views import (
    BotSimulationCancelView,
    BotSimulationCompleteView,
    BotSimulationView,
    ChanceSimulationView,
    DailyMissionsView,
    GameLeaderboardView,
    GameResultCreateView,
    InternalGameSettleView,
    LiveStatsView,
    MatchmakingCancelView,
    MatchmakingHeartbeatView,
    MatchmakingQueueView,
    MatchmakingStatusView,
    ResumableTablesView,
    TableAdmissionView,
    TableCapabilitiesView,
    TableJoinByCodeView,
    TableJoinView,
    TableLeaveView,
    TableListCreateView,
    TestDrawEntryView,
    TestDrawListView,
    TestDrawResultView,
    TestGamesActivityView,
    TestGamesCatalogView,
    TestInstantPlayView,
    TournamentDetailView,
    TournamentListCreateView,
    TournamentRegisterView,
)

urlpatterns = [
    path("resumable/", ResumableTablesView.as_view()),
    path("table-capabilities/", TableCapabilitiesView.as_view()),
    path("player-statistics/", UniquePlayerStatisticsView.as_view()),
    path("internal/human-activity/", ConfirmHumanActivityView.as_view()),
    path("live-stats/", LiveStatsView.as_view(), name="live-stats"),
    path("bot-simulations/", BotSimulationView.as_view(), name="bot-simulation"),
    path(
        "chance-simulations/",
        ChanceSimulationView.as_view(),
        name="chance-simulation",
    ),
    path(
        "bot-simulations/<uuid:session_id>/",
        BotSimulationCancelView.as_view(),
        name="bot-simulation-cancel",
    ),
    path(
        "internal/bots/session-complete/",
        BotSimulationCompleteView.as_view(),
        name="bot-simulation-complete",
    ),
    path(
        "internal/settle-round/",
        InternalGameSettleView.as_view(),
        name="internal-game-settle",
    ),
    path("tables/", TableListCreateView.as_view(), name="table-list-create"),
    path(
        "tables/join-by-code/",
        TableJoinByCodeView.as_view(),
        name="table-join-by-code",
    ),
    path("tables/<uuid:table_id>/join/", TableJoinView.as_view(), name="table-join"),
    path(
        "tables/<uuid:table_id>/leave/",
        TableLeaveView.as_view(),
        name="table-leave",
    ),
    path(
        "tables/<uuid:table_id>/admission/",
        TableAdmissionView.as_view(),
        name="table-admission",
    ),
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
    path(
        "tournaments/",
        TournamentListCreateView.as_view(),
        name="tournament-list-create",
    ),
    path(
        "tournaments/<uuid:tournament_id>/",
        TournamentDetailView.as_view(),
        name="tournament-detail",
    ),
    path(
        "tournaments/<uuid:tournament_id>/register/",
        TournamentRegisterView.as_view(),
        name="tournament-register",
    ),
]
