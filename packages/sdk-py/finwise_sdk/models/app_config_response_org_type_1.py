from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.app_config_response_org_type_1_type import AppConfigResponseOrgType1Type
from ..models.org_role import OrgRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="AppConfigResponseOrgType1")


@_attrs_define
class AppConfigResponseOrgType1:
    """
    Attributes:
        id (str):
        role (OrgRole):
        member_id (str):
        name (Union[Unset, str]):
        slug (Union[Unset, str]):
        type_ (Union[Unset, AppConfigResponseOrgType1Type]):
        currency (Union[Unset, str]):
        locale (Union[Unset, str]):
        timezone (Union[Unset, str]):
    """

    id: str
    role: OrgRole
    member_id: str
    name: Union[Unset, str] = UNSET
    slug: Union[Unset, str] = UNSET
    type_: Union[Unset, AppConfigResponseOrgType1Type] = UNSET
    currency: Union[Unset, str] = UNSET
    locale: Union[Unset, str] = UNSET
    timezone: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        role = self.role.value

        member_id = self.member_id

        name = self.name

        slug = self.slug

        type_: Union[Unset, str] = UNSET
        if not isinstance(self.type_, Unset):
            type_ = self.type_.value

        currency = self.currency

        locale = self.locale

        timezone = self.timezone

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "role": role,
                "member_id": member_id,
            }
        )
        if name is not UNSET:
            field_dict["name"] = name
        if slug is not UNSET:
            field_dict["slug"] = slug
        if type_ is not UNSET:
            field_dict["type"] = type_
        if currency is not UNSET:
            field_dict["currency"] = currency
        if locale is not UNSET:
            field_dict["locale"] = locale
        if timezone is not UNSET:
            field_dict["timezone"] = timezone

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        role = OrgRole(d.pop("role"))

        member_id = d.pop("member_id")

        name = d.pop("name", UNSET)

        slug = d.pop("slug", UNSET)

        _type_ = d.pop("type", UNSET)
        type_: Union[Unset, AppConfigResponseOrgType1Type]
        if isinstance(_type_, Unset):
            type_ = UNSET
        else:
            type_ = AppConfigResponseOrgType1Type(_type_)

        currency = d.pop("currency", UNSET)

        locale = d.pop("locale", UNSET)

        timezone = d.pop("timezone", UNSET)

        app_config_response_org_type_1 = cls(
            id=id,
            role=role,
            member_id=member_id,
            name=name,
            slug=slug,
            type_=type_,
            currency=currency,
            locale=locale,
            timezone=timezone,
        )

        return app_config_response_org_type_1
