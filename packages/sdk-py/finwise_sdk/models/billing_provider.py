from enum import Enum


class BillingProvider(str, Enum):
    STRIPE = "stripe"
    STUB = "stub"

    def __str__(self) -> str:
        return str(self.value)
