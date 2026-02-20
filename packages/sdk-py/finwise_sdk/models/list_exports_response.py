from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.export_job import ExportJob


T = TypeVar("T", bound="ListExportsResponse")


@_attrs_define
class ListExportsResponse:
    """
    Attributes:
        exports (list['ExportJob']):
        request_id (str):
    """

    exports: list["ExportJob"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        exports = []
        for exports_item_data in self.exports:
            exports_item = exports_item_data.to_dict()
            exports.append(exports_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "exports": exports,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.export_job import ExportJob

        d = src_dict.copy()
        exports = []
        _exports = d.pop("exports")
        for exports_item_data in _exports:
            exports_item = ExportJob.from_dict(exports_item_data)

            exports.append(exports_item)

        request_id = d.pop("request_id")

        list_exports_response = cls(
            exports=exports,
            request_id=request_id,
        )

        return list_exports_response
