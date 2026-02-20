from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="MarketplaceInstallRequest")


@_attrs_define
class MarketplaceInstallRequest:
    """
    Attributes:
        plugin_key (str):
        version (Union[Unset, str]):
        permissions (Union[Unset, list[str]]):
    """

    plugin_key: str
    version: Union[Unset, str] = UNSET
    permissions: Union[Unset, list[str]] = UNSET

    def to_dict(self) -> dict[str, Any]:
        plugin_key = self.plugin_key

        version = self.version

        permissions: Union[Unset, list[str]] = UNSET
        if not isinstance(self.permissions, Unset):
            permissions = self.permissions

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plugin_key": plugin_key,
            }
        )
        if version is not UNSET:
            field_dict["version"] = version
        if permissions is not UNSET:
            field_dict["permissions"] = permissions

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        plugin_key = d.pop("plugin_key")

        version = d.pop("version", UNSET)

        permissions = cast(list[str], d.pop("permissions", UNSET))

        marketplace_install_request = cls(
            plugin_key=plugin_key,
            version=version,
            permissions=permissions,
        )

        return marketplace_install_request
