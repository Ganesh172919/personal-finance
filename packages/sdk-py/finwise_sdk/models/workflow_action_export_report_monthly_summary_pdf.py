from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..models.workflow_action_export_report_monthly_summary_pdf_export_type import (
    WorkflowActionExportReportMonthlySummaryPdfExportType,
)
from ..models.workflow_action_export_report_monthly_summary_pdf_type import (
    WorkflowActionExportReportMonthlySummaryPdfType,
)

if TYPE_CHECKING:
    from ..models.monthly_summary_pdf_export_params import MonthlySummaryPdfExportParams


T = TypeVar("T", bound="WorkflowActionExportReportMonthlySummaryPdf")


@_attrs_define
class WorkflowActionExportReportMonthlySummaryPdf:
    """
    Attributes:
        type_ (WorkflowActionExportReportMonthlySummaryPdfType):
        export_type (WorkflowActionExportReportMonthlySummaryPdfExportType):
        params (MonthlySummaryPdfExportParams):
    """

    type_: WorkflowActionExportReportMonthlySummaryPdfType
    export_type: WorkflowActionExportReportMonthlySummaryPdfExportType
    params: "MonthlySummaryPdfExportParams"

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        export_type = self.export_type.value

        params = self.params.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "export_type": export_type,
                "params": params,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.monthly_summary_pdf_export_params import (
            MonthlySummaryPdfExportParams,
        )

        d = src_dict.copy()
        type_ = WorkflowActionExportReportMonthlySummaryPdfType(d.pop("type"))

        export_type = WorkflowActionExportReportMonthlySummaryPdfExportType(
            d.pop("export_type")
        )

        params = MonthlySummaryPdfExportParams.from_dict(d.pop("params"))

        workflow_action_export_report_monthly_summary_pdf = cls(
            type_=type_,
            export_type=export_type,
            params=params,
        )

        return workflow_action_export_report_monthly_summary_pdf
