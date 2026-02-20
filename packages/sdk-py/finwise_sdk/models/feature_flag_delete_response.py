from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="FeatureFlagDeleteResponse")


@_attrs_define
class FeatureFlagDeleteResponse:
    """
    Attributes:
        org_id (str):
        key (str):
        deleted (bool):
        request_id (str):
    """

    org_id: str
    key: str
    deleted: bool
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        key = self.key

        deleted = self.deleted

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "key": key,
                "deleted": deleted,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        org_id = d.pop("org_id")

        key = d.pop("key")

        deleted = d.pop("deleted")

        request_id = d.pop("request_id")

        feature_flag_delete_response = cls(
            org_id=org_id,
            key=key,
            deleted=deleted,
            request_id=request_id,
        )

        return feature_flag_delete_response
