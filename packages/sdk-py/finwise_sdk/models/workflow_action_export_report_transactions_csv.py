from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.workflow_action_export_report_transactions_csv_export_type import (
    WorkflowActionExportReportTransactionsCsvExportType,
)
from ..models.workflow_action_export_report_transactions_csv_type import (
    WorkflowActionExportReportTransactionsCsvType,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.transactions_csv_export_params import TransactionsCsvExportParams


T = TypeVar("T", bound="WorkflowActionExportReportTransactionsCsv")


@_attrs_define
class WorkflowActionExportReportTransactionsCsv:
    """
    Attributes:
        type_ (WorkflowActionExportReportTransactionsCsvType):
        export_type (WorkflowActionExportReportTransactionsCsvExportType):
        params (Union[Unset, TransactionsCsvExportParams]):
    """

    type_: WorkflowActionExportReportTransactionsCsvType
    export_type: WorkflowActionExportReportTransactionsCsvExportType
    params: Union[Unset, "TransactionsCsvExportParams"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        export_type = self.export_type.value

        params: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.params, Unset):
            params = self.params.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "export_type": export_type,
            }
        )
        if params is not UNSET:
            field_dict["params"] = params

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.transactions_csv_export_params import TransactionsCsvExportParams

        d = src_dict.copy()
        type_ = WorkflowActionExportReportTransactionsCsvType(d.pop("type"))

        export_type = WorkflowActionExportReportTransactionsCsvExportType(
            d.pop("export_type")
        )

        _params = d.pop("params", UNSET)
        params: Union[Unset, TransactionsCsvExportParams]
        if isinstance(_params, Unset):
            params = UNSET
        else:
            params = TransactionsCsvExportParams.from_dict(_params)

        workflow_action_export_report_transactions_csv = cls(
            type_=type_,
            export_type=export_type,
            params=params,
        )

        return workflow_action_export_report_transactions_csv
