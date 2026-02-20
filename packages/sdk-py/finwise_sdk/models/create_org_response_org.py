from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.create_org_response_org_type import CreateOrgResponseOrgType
from ..models.org_role import OrgRole

T = TypeVar("T", bound="CreateOrgResponseOrg")


@_attrs_define
class CreateOrgResponseOrg:
    """
    Attributes:
        id (str):
        slug (str):
        name (str):
        type_ (CreateOrgResponseOrgType):
        currency (str):
        locale (str):
        timezone (str):
        role (OrgRole):
    """

    id: str
    slug: str
    name: str
    type_: CreateOrgResponseOrgType
    currency: str
    locale: str
    timezone: str
    role: OrgRole

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        slug = self.slug

        name = self.name

        type_ = self.type_.value

        currency = self.currency

        locale = self.locale

        timezone = self.timezone

        role = self.role.value

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "slug": slug,
                "name": name,
                "type": type_,
                "currency": currency,
                "locale": locale,
                "timezone": timezone,
                "role": role,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        slug = d.pop("slug")

        name = d.pop("name")

        type_ = CreateOrgResponseOrgType(d.pop("type"))

        currency = d.pop("currency")

        locale = d.pop("locale")

        timezone = d.pop("timezone")

        role = OrgRole(d.pop("role"))

        create_org_response_org = cls(
            id=id,
            slug=slug,
            name=name,
            type_=type_,
            currency=currency,
            locale=locale,
            timezone=timezone,
            role=role,
        )

        return create_org_response_org
