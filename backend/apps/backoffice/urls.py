from django.urls import path

from .views import AuditEventListView
from .flag_views import FeatureFlagView

urlpatterns = [path("audit-events/", AuditEventListView.as_view(), name="audit-events"), path("feature-flags/", FeatureFlagView.as_view(), name="feature-flags")]
