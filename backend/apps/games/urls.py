from django.urls import path

from .views import TableJoinView, TableListCreateView

urlpatterns = [
    path("tables/", TableListCreateView.as_view(), name="table-list-create"),
    path("tables/<uuid:table_id>/join/", TableJoinView.as_view(), name="table-join"),
]
