from enum import Enum


class ListTransactionsType(str, Enum):
    EXPENSE = "expense"
    INCOME = "income"
    INVESTMENT = "investment"

    def __str__(self) -> str:
        return str(self.value)
