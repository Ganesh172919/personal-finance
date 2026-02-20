from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ConnectIntegrationBody")


@_attrs_define
class ConnectIntegrationBody:
    """ """

    def to_dict(self) -> dict[str, Any]:
        field_dict: dict[str, Any] = {}

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        connect_integration_body = cls()

        return connect_integration_body
