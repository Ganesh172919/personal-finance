from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="UpdateOrgSettingsRequest")


@_attrs_define
class UpdateOrgSettingsRequest:
    """
    Attributes:
        currency (Union[Unset, str]):
        locale (Union[Unset, str]):
        timezone (Union[Unset, str]):
    """

    currency: Union[Unset, str] = UNSET
    locale: Union[Unset, str] = UNSET
    timezone: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        currency = self.currency

        locale = self.locale

        timezone = self.timezone

        field_dict: dict[str, Any] = {}
        field_dict.update({})
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
        currency = d.pop("currency", UNSET)

        locale = d.pop("locale", UNSET)

        timezone = d.pop("timezone", UNSET)

        update_org_settings_request = cls(
            currency=currency,
            locale=locale,
            timezone=timezone,
        )

        return update_org_settings_request
