from enum import Enum


class WorkflowActionExportReportMonthlySummaryPdfType(str, Enum):
    EXPORT_REPORT = "export_report"

    def __str__(self) -> str:
        return str(self.value)
