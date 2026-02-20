from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.export_job import ExportJob


T = TypeVar("T", bound="GetExportResponse")


@_attrs_define
class GetExportResponse:
    """
    Attributes:
        export (ExportJob):
        request_id (str):
    """

    export: "ExportJob"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        export = self.export.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "export": export,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.export_job import ExportJob

        d = src_dict.copy()
        export = ExportJob.from_dict(d.pop("export"))

        request_id = d.pop("request_id")

        get_export_response = cls(
            export=export,
            request_id=request_id,
        )

        return get_export_response
