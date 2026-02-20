from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.org_role import OrgRole
from ..models.orgs_me_response_orgs_item_type import OrgsMeResponseOrgsItemType

T = TypeVar("T", bound="OrgsMeResponseOrgsItem")


@_attrs_define
class OrgsMeResponseOrgsItem:
    """
    Attributes:
        id (str):
        name (str):
        slug (str):
        type_ (OrgsMeResponseOrgsItemType):
        currency (str):
        locale (str):
        timezone (str):
        role (OrgRole):
        is_default (bool):
    """

    id: str
    name: str
    slug: str
    type_: OrgsMeResponseOrgsItemType
    currency: str
    locale: str
    timezone: str
    role: OrgRole
    is_default: bool

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        slug = self.slug

        type_ = self.type_.value

        currency = self.currency

        locale = self.locale

        timezone = self.timezone

        role = self.role.value

        is_default = self.is_default

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
                "role": role,
                "is_default": is_default,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        slug = d.pop("slug")

        type_ = OrgsMeResponseOrgsItemType(d.pop("type"))

        currency = d.pop("currency")

        locale = d.pop("locale")

        timezone = d.pop("timezone")

        role = OrgRole(d.pop("role"))

        is_default = d.pop("is_default")

        orgs_me_response_orgs_item = cls(
            id=id,
            name=name,
            slug=slug,
            type_=type_,
            currency=currency,
            locale=locale,
            timezone=timezone,
            role=role,
            is_default=is_default,
        )

        return orgs_me_response_orgs_item
