from typing import Dict, Type

from .airtel import AirtelMoneyAdapter
from .base import BaseMobileMoneyAdapter, PaymentInitiationResult
from .mvola import MVolaAdapter
from .orange import OrangeMoneyAdapter

ADAPTERS: Dict[str, Type[BaseMobileMoneyAdapter]] = {
    "mvola": MVolaAdapter,
    "orange": OrangeMoneyAdapter,
    "airtel": AirtelMoneyAdapter,
}


def get_adapter(provider: str, sandbox: bool = True) -> BaseMobileMoneyAdapter:
    adapter_cls = ADAPTERS.get(provider)
    if not adapter_cls:
        raise ValueError(f"Opérateur Mobile Money non reconnu : {provider}")
    return adapter_cls(sandbox=sandbox)
