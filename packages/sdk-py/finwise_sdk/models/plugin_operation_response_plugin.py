import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="PluginOperationResponsePlugin")


@_attrs_define
class PluginOperationResponsePlugin:
    """
    Attributes:
        plugin_key (str):
        version (str):
        status (str):
        updated_at (Union[None, datetime.datetime]):
    """

    plugin_key: str
    version: str
    status: str
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        plugin_key = self.plugin_key

        version = self.version

        status = self.status

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plugin_key": plugin_key,
                "version": version,
                "status": status,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        plugin_key = d.pop("plugin_key")

        version = d.pop("version")

        status = d.pop("status")

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        plugin_operation_response_plugin = cls(
            plugin_key=plugin_key,
            version=version,
            status=status,
            updated_at=updated_at,
        )

        return plugin_operation_response_plugin
