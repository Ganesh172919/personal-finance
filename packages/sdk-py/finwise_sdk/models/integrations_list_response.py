from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.integrations_list_response_connectors_item import (
        IntegrationsListResponseConnectorsItem,
    )


T = TypeVar("T", bound="IntegrationsListResponse")


@_attrs_define
class IntegrationsListResponse:
    """
    Attributes:
        org_id (str):
        connectors (list['IntegrationsListResponseConnectorsItem']):
        request_id (str):
    """

    org_id: str
    connectors: list["IntegrationsListResponseConnectorsItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        connectors = []
        for connectors_item_data in self.connectors:
            connectors_item = connectors_item_data.to_dict()
            connectors.append(connectors_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "connectors": connectors,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integrations_list_response_connectors_item import (
            IntegrationsListResponseConnectorsItem,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        connectors = []
        _connectors = d.pop("connectors")
        for connectors_item_data in _connectors:
            connectors_item = IntegrationsListResponseConnectorsItem.from_dict(
                connectors_item_data
            )

            connectors.append(connectors_item)

        request_id = d.pop("request_id")

        integrations_list_response = cls(
            org_id=org_id,
            connectors=connectors,
            request_id=request_id,
        )

        return integrations_list_response
