from enum import Enum


class RecurringRuleStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"

    def __str__(self) -> str:
        return str(self.value)
