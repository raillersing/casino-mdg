import dataclasses
from typing import Any, Dict, Optional


@dataclasses.dataclass
class PaymentInitiationResult:
    success: bool
    provider_reference: str = ""
    checkout_url: str = ""
    status: str = "pending"  # "pending", "processing", "completed", "failed"
    message: str = ""
    raw_response: Dict[str, Any] = dataclasses.field(default_factory=dict)


class BaseMobileMoneyAdapter:
    provider_name: str = "base"

    def __init__(self, sandbox: bool = True):
        self.sandbox = sandbox

    def initiate_deposit(
        self, intent, phone_number: str
    ) -> PaymentInitiationResult:
        raise NotImplementedError

    def initiate_withdrawal(
        self, intent, phone_number: str
    ) -> PaymentInitiationResult:
        raise NotImplementedError

    def verify_transaction_status(
        self, provider_reference: str
    ) -> Dict[str, Any]:
        raise NotImplementedError
