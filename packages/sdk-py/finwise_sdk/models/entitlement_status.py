from enum import Enum


class EntitlementStatus(str, Enum):
    ACTIVE = "active"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"

    def __str__(self) -> str:
        return str(self.value)
