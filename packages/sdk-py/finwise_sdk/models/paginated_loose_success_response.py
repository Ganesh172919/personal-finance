from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.pagination import Pagination


T = TypeVar("T", bound="PaginatedLooseSuccessResponse")


@_attrs_define
class PaginatedLooseSuccessResponse:
    """
    Attributes:
        request_id (str):
        pagination (Pagination):
        org_id (Union[Unset, str]):
    """

    request_id: str
    pagination: "Pagination"
    org_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        request_id = self.request_id

        pagination = self.pagination.to_dict()

        org_id = self.org_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "request_id": request_id,
                "pagination": pagination,
            }
        )
        if org_id is not UNSET:
            field_dict["org_id"] = org_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.pagination import Pagination

        d = src_dict.copy()
        request_id = d.pop("request_id")

        pagination = Pagination.from_dict(d.pop("pagination"))

        org_id = d.pop("org_id", UNSET)

        paginated_loose_success_response = cls(
            request_id=request_id,
            pagination=pagination,
            org_id=org_id,
        )

        paginated_loose_success_response.additional_properties = d
        return paginated_loose_success_response

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
