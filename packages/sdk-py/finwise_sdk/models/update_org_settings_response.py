from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.update_org_settings_response_org import UpdateOrgSettingsResponseOrg


T = TypeVar("T", bound="UpdateOrgSettingsResponse")


@_attrs_define
class UpdateOrgSettingsResponse:
    """
    Attributes:
        org (UpdateOrgSettingsResponseOrg):
        request_id (str):
    """

    org: "UpdateOrgSettingsResponseOrg"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org = self.org.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org": org,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.update_org_settings_response_org import (
            UpdateOrgSettingsResponseOrg,
        )

        d = src_dict.copy()
        org = UpdateOrgSettingsResponseOrg.from_dict(d.pop("org"))

        request_id = d.pop("request_id")

        update_org_settings_response = cls(
            org=org,
            request_id=request_id,
        )

        return update_org_settings_response
