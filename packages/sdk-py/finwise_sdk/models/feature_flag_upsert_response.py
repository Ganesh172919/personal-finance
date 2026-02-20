from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.feature_flag_row import FeatureFlagRow


T = TypeVar("T", bound="FeatureFlagUpsertResponse")


@_attrs_define
class FeatureFlagUpsertResponse:
    """
    Attributes:
        org_id (str):
        flag (FeatureFlagRow):
        request_id (str):
    """

    org_id: str
    flag: "FeatureFlagRow"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        flag = self.flag.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "flag": flag,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.feature_flag_row import FeatureFlagRow

        d = src_dict.copy()
        org_id = d.pop("org_id")

        flag = FeatureFlagRow.from_dict(d.pop("flag"))

        request_id = d.pop("request_id")

        feature_flag_upsert_response = cls(
            org_id=org_id,
            flag=flag,
            request_id=request_id,
        )

        return feature_flag_upsert_response
