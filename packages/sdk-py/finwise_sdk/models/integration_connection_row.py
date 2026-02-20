import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.integration_connection_row_metadata import (
        IntegrationConnectionRowMetadata,
    )


T = TypeVar("T", bound="IntegrationConnectionRow")


@_attrs_define
class IntegrationConnectionRow:
    """
    Attributes:
        connector_key (str):
        status (str):
        last_sync_at (Union[None, datetime.datetime]):
        last_error (Union[None, str]):
        metadata (IntegrationConnectionRowMetadata):
        updated_at (Union[None, datetime.datetime]):
    """

    connector_key: str
    status: str
    last_sync_at: Union[None, datetime.datetime]
    last_error: Union[None, str]
    metadata: "IntegrationConnectionRowMetadata"
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
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

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "connector_key": connector_key,
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
        from ..models.integration_connection_row_metadata import (
            IntegrationConnectionRowMetadata,
        )

        d = src_dict.copy()
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

        metadata = IntegrationConnectionRowMetadata.from_dict(d.pop("metadata"))

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

        integration_connection_row = cls(
            connector_key=connector_key,
            status=status,
            last_sync_at=last_sync_at,
            last_error=last_error,
            metadata=metadata,
            updated_at=updated_at,
        )

        return integration_connection_row
