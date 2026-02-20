from enum import Enum


class TaskKind(str, Enum):
    BUDGET = "budget"
    CASHFLOW = "cashflow"
    DEBT = "debt"
    EDUCATION = "education"
    GENERIC = "generic"
    GOAL = "goal"
    INVEST = "invest"

    def __str__(self) -> str:
        return str(self.value)
