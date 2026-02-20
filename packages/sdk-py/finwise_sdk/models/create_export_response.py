from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.export_job import ExportJob


T = TypeVar("T", bound="CreateExportResponse")


@_attrs_define
class CreateExportResponse:
    """
    Attributes:
        export (ExportJob):
        queued (bool):
        request_id (str):
    """

    export: "ExportJob"
    queued: bool
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        export = self.export.to_dict()

        queued = self.queued

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "export": export,
                "queued": queued,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.export_job import ExportJob

        d = src_dict.copy()
        export = ExportJob.from_dict(d.pop("export"))

        queued = d.pop("queued")

        request_id = d.pop("request_id")

        create_export_response = cls(
            export=export,
            queued=queued,
            request_id=request_id,
        )

        return create_export_response
