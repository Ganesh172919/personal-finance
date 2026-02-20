from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.plugin_operation_response_plugin import PluginOperationResponsePlugin


T = TypeVar("T", bound="PluginOperationResponse")


@_attrs_define
class PluginOperationResponse:
    """
    Attributes:
        org_id (str):
        plugin (PluginOperationResponsePlugin):
        request_id (str):
    """

    org_id: str
    plugin: "PluginOperationResponsePlugin"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        plugin = self.plugin.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "plugin": plugin,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.plugin_operation_response_plugin import (
            PluginOperationResponsePlugin,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        plugin = PluginOperationResponsePlugin.from_dict(d.pop("plugin"))

        request_id = d.pop("request_id")

        plugin_operation_response = cls(
            org_id=org_id,
            plugin=plugin,
            request_id=request_id,
        )

        return plugin_operation_response
