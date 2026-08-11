from django.urls import path

from .views import WalletBalanceView, WalletTransactionsView

urlpatterns = [
    path("balance/", WalletBalanceView.as_view(), name="wallet-balance"),
    path("transactions/", WalletTransactionsView.as_view(), name="wallet-transactions"),
]
