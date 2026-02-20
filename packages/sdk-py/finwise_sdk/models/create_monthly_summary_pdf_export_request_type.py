from enum import Enum


class CreateMonthlySummaryPdfExportRequestType(str, Enum):
    MONTHLY_SUMMARY_PDF = "monthly_summary_pdf"

    def __str__(self) -> str:
        return str(self.value)
