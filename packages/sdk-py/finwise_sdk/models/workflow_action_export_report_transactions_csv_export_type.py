from enum import Enum


class WorkflowActionExportReportTransactionsCsvExportType(str, Enum):
    TRANSACTIONS_CSV = "transactions_csv"

    def __str__(self) -> str:
        return str(self.value)
