from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.update_org_settings_response_org_type import (
    UpdateOrgSettingsResponseOrgType,
)

T = TypeVar("T", bound="UpdateOrgSettingsResponseOrg")


@_attrs_define
class UpdateOrgSettingsResponseOrg:
    """
    Attributes:
        id (str):
        name (str):
        slug (str):
        type_ (UpdateOrgSettingsResponseOrgType):
        currency (str):
        locale (str):
        timezone (str):
    """

    id: str
    name: str
    slug: str
    type_: UpdateOrgSettingsResponseOrgType
    currency: str
    locale: str
    timezone: str

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        slug = self.slug

        type_ = self.type_.value

        currency = self.currency

        locale = self.locale

        timezone = self.timezone

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "slug": slug,
                "type": type_,
                "currency": currency,
                "locale": locale,
                "timezone": timezone,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        slug = d.pop("slug")

        type_ = UpdateOrgSettingsResponseOrgType(d.pop("type"))

        currency = d.pop("currency")

        locale = d.pop("locale")

        timezone = d.pop("timezone")

        update_org_settings_response_org = cls(
            id=id,
            name=name,
            slug=slug,
            type_=type_,
            currency=currency,
            locale=locale,
            timezone=timezone,
        )

        return update_org_settings_response_org
