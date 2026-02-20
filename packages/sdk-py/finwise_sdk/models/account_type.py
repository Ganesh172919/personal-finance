from enum import Enum


class AccountType(str, Enum):
    BROKERAGE = "brokerage"
    CASH = "cash"
    CHECKING = "checking"
    CREDIT = "credit"
    SAVINGS = "savings"

    def __str__(self) -> str:
        return str(self.value)
