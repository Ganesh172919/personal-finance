from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.create_monthly_summary_pdf_export_request_type import (
    CreateMonthlySummaryPdfExportRequestType,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.monthly_summary_pdf_export_params import MonthlySummaryPdfExportParams


T = TypeVar("T", bound="CreateMonthlySummaryPdfExportRequest")


@_attrs_define
class CreateMonthlySummaryPdfExportRequest:
    """
    Attributes:
        type_ (CreateMonthlySummaryPdfExportRequestType):
        params (MonthlySummaryPdfExportParams):
        idempotency_key (Union[Unset, str]):
    """

    type_: CreateMonthlySummaryPdfExportRequestType
    params: "MonthlySummaryPdfExportParams"
    idempotency_key: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        params = self.params.to_dict()

        idempotency_key = self.idempotency_key

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "params": params,
            }
        )
        if idempotency_key is not UNSET:
            field_dict["idempotency_key"] = idempotency_key

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.monthly_summary_pdf_export_params import (
            MonthlySummaryPdfExportParams,
        )

        d = src_dict.copy()
        type_ = CreateMonthlySummaryPdfExportRequestType(d.pop("type"))

        params = MonthlySummaryPdfExportParams.from_dict(d.pop("params"))

        idempotency_key = d.pop("idempotency_key", UNSET)

        create_monthly_summary_pdf_export_request = cls(
            type_=type_,
            params=params,
            idempotency_key=idempotency_key,
        )

        return create_monthly_summary_pdf_export_request
