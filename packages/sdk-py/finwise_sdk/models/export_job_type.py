from enum import Enum


class ExportJobType(str, Enum):
    MONTHLY_SUMMARY_PDF = "monthly_summary_pdf"
    TRANSACTIONS_CSV = "transactions_csv"

    def __str__(self) -> str:
        return str(self.value)
