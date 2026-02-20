from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="PluginVersionUpdateRequest")


@_attrs_define
class PluginVersionUpdateRequest:
    """
    Attributes:
        version (str):
    """

    version: str

    def to_dict(self) -> dict[str, Any]:
        version = self.version

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "version": version,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        version = d.pop("version")

        plugin_version_update_request = cls(
            version=version,
        )

        return plugin_version_update_request
