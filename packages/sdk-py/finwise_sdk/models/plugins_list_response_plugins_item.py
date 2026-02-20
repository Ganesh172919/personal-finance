import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="PluginsListResponsePluginsItem")


@_attrs_define
class PluginsListResponsePluginsItem:
    """
    Attributes:
        plugin_key (str):
        name (str):
        publisher (str):
        version (str):
        status (str):
        permissions (list[str]):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    plugin_key: str
    name: str
    publisher: str
    version: str
    status: str
    permissions: list[str]
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        plugin_key = self.plugin_key

        name = self.name

        publisher = self.publisher

        version = self.version

        status = self.status

        permissions = self.permissions

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plugin_key": plugin_key,
                "name": name,
                "publisher": publisher,
                "version": version,
                "status": status,
                "permissions": permissions,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        plugin_key = d.pop("plugin_key")

        name = d.pop("name")

        publisher = d.pop("publisher")

        version = d.pop("version")

        status = d.pop("status")

        permissions = cast(list[str], d.pop("permissions"))

        def _parse_created_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_1 = isoparse(data)

                return created_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        created_at = _parse_created_at(d.pop("created_at"))

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

        plugins_list_response_plugins_item = cls(
            plugin_key=plugin_key,
            name=name,
            publisher=publisher,
            version=version,
            status=status,
            permissions=permissions,
            created_at=created_at,
            updated_at=updated_at,
        )

        return plugins_list_response_plugins_item
