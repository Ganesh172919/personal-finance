from enum import Enum


class AccountStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"

    def __str__(self) -> str:
        return str(self.value)
