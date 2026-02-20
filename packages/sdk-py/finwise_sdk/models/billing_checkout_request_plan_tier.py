from enum import Enum


class BillingCheckoutRequestPlanTier(str, Enum):
    PRO = "pro"
    TEAM = "team"

    def __str__(self) -> str:
        return str(self.value)
