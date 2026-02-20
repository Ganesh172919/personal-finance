from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.feature_flag_row import FeatureFlagRow


T = TypeVar("T", bound="FeatureFlagsListResponse")


@_attrs_define
class FeatureFlagsListResponse:
    """
    Attributes:
        org_id (str):
        flags (list['FeatureFlagRow']):
        request_id (str):
    """

    org_id: str
    flags: list["FeatureFlagRow"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        flags = []
        for flags_item_data in self.flags:
            flags_item = flags_item_data.to_dict()
            flags.append(flags_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "flags": flags,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.feature_flag_row import FeatureFlagRow

        d = src_dict.copy()
        org_id = d.pop("org_id")

        flags = []
        _flags = d.pop("flags")
        for flags_item_data in _flags:
            flags_item = FeatureFlagRow.from_dict(flags_item_data)

            flags.append(flags_item)

        request_id = d.pop("request_id")

        feature_flags_list_response = cls(
            org_id=org_id,
            flags=flags,
            request_id=request_id,
        )

        return feature_flags_list_response
