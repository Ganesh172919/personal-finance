from enum import Enum


class RecurringCandidateCadence(str, Enum):
    MONTHLY = "monthly"
    WEEKLY = "weekly"

    def __str__(self) -> str:
        return str(self.value)
