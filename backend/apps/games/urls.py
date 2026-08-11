from django.urls import path

from .views import DailyMissionsView, GameLeaderboardView, GameResultCreateView, TableJoinView, TableListCreateView

urlpatterns = [
    path("tables/", TableListCreateView.as_view(), name="table-list-create"),
    path("tables/<uuid:table_id>/join/", TableJoinView.as_view(), name="table-join"),
    path("results/", GameResultCreateView.as_view(), name="game-result"),
    path("leaderboard/", GameLeaderboardView.as_view(), name="game-leaderboard"),
    path("missions/", DailyMissionsView.as_view(), name="daily-missions"),
]
