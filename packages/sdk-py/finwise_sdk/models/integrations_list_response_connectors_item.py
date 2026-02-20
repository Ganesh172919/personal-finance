import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.integrations_list_response_connectors_item_metadata import (
        IntegrationsListResponseConnectorsItemMetadata,
    )


T = TypeVar("T", bound="IntegrationsListResponseConnectorsItem")


@_attrs_define
class IntegrationsListResponseConnectorsItem:
    """
    Attributes:
        connector_key (str):
        name (str):
        category (str):
        supports_webhook (bool):
        stub_mode (bool):
        status (str):
        last_sync_at (Union[None, datetime.datetime]):
        last_error (Union[None, str]):
        metadata (IntegrationsListResponseConnectorsItemMetadata):
        updated_at (Union[None, datetime.datetime]):
    """

    connector_key: str
    name: str
    category: str
    supports_webhook: bool
    stub_mode: bool
    status: str
    last_sync_at: Union[None, datetime.datetime]
    last_error: Union[None, str]
    metadata: "IntegrationsListResponseConnectorsItemMetadata"
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        connector_key = self.connector_key

        name = self.name

        category = self.category

        supports_webhook = self.supports_webhook

        stub_mode = self.stub_mode

        status = self.status

        last_sync_at: Union[None, str]
        if isinstance(self.last_sync_at, datetime.datetime):
            last_sync_at = self.last_sync_at.isoformat()
        else:
            last_sync_at = self.last_sync_at

        last_error: Union[None, str]
        last_error = self.last_error

        metadata = self.metadata.to_dict()

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "connector_key": connector_key,
                "name": name,
                "category": category,
                "supports_webhook": supports_webhook,
                "stub_mode": stub_mode,
                "status": status,
                "last_sync_at": last_sync_at,
                "last_error": last_error,
                "metadata": metadata,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integrations_list_response_connectors_item_metadata import (
            IntegrationsListResponseConnectorsItemMetadata,
        )

        d = src_dict.copy()
        connector_key = d.pop("connector_key")

        name = d.pop("name")

        category = d.pop("category")

        supports_webhook = d.pop("supports_webhook")

        stub_mode = d.pop("stub_mode")

        status = d.pop("status")

        def _parse_last_sync_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_sync_at_type_1 = isoparse(data)

                return last_sync_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        last_sync_at = _parse_last_sync_at(d.pop("last_sync_at"))

        def _parse_last_error(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        last_error = _parse_last_error(d.pop("last_error"))

        metadata = IntegrationsListResponseConnectorsItemMetadata.from_dict(
            d.pop("metadata")
        )

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

        integrations_list_response_connectors_item = cls(
            connector_key=connector_key,
            name=name,
            category=category,
            supports_webhook=supports_webhook,
            stub_mode=stub_mode,
            status=status,
            last_sync_at=last_sync_at,
            last_error=last_error,
            metadata=metadata,
            updated_at=updated_at,
        )

        return integrations_list_response_connectors_item
