from enum import Enum


class CreateTransactionsCsvExportRequestType(str, Enum):
    TRANSACTIONS_CSV = "transactions_csv"

    def __str__(self) -> str:
        return str(self.value)
