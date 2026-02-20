import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.integration_health_response_metadata import (
        IntegrationHealthResponseMetadata,
    )


T = TypeVar("T", bound="IntegrationHealthResponse")


@_attrs_define
class IntegrationHealthResponse:
    """
    Attributes:
        org_id (str):
        connector_key (str):
        status (str):
        last_sync_at (Union[None, datetime.datetime]):
        last_error (Union[None, str]):
        metadata (IntegrationHealthResponseMetadata):
        updated_at (Union[None, datetime.datetime]):
        request_id (str):
    """

    org_id: str
    connector_key: str
    status: str
    last_sync_at: Union[None, datetime.datetime]
    last_error: Union[None, str]
    metadata: "IntegrationHealthResponseMetadata"
    updated_at: Union[None, datetime.datetime]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        connector_key = self.connector_key

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

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "connector_key": connector_key,
                "status": status,
                "last_sync_at": last_sync_at,
                "last_error": last_error,
                "metadata": metadata,
                "updated_at": updated_at,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integration_health_response_metadata import (
            IntegrationHealthResponseMetadata,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        connector_key = d.pop("connector_key")

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

        metadata = IntegrationHealthResponseMetadata.from_dict(d.pop("metadata"))

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

        request_id = d.pop("request_id")

        integration_health_response = cls(
            org_id=org_id,
            connector_key=connector_key,
            status=status,
            last_sync_at=last_sync_at,
            last_error=last_error,
            metadata=metadata,
            updated_at=updated_at,
            request_id=request_id,
        )

        return integration_health_response
