from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="MonthlySummaryPdfExportParams")


@_attrs_define
class MonthlySummaryPdfExportParams:
    """
    Attributes:
        period_key (str):
    """

    period_key: str

    def to_dict(self) -> dict[str, Any]:
        period_key = self.period_key

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "period_key": period_key,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        period_key = d.pop("period_key")

        monthly_summary_pdf_export_params = cls(
            period_key=period_key,
        )

        return monthly_summary_pdf_export_params
