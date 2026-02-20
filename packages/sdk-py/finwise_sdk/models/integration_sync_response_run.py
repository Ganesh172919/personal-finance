import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.integration_sync_response_run_status import (
    IntegrationSyncResponseRunStatus,
)

T = TypeVar("T", bound="IntegrationSyncResponseRun")


@_attrs_define
class IntegrationSyncResponseRun:
    """
    Attributes:
        id (str):
        connector_key (str):
        status (IntegrationSyncResponseRunStatus):
        records_synced (int):
        started_at (Union[None, datetime.datetime]):
        finished_at (Union[None, datetime.datetime]):
        error (Union[None, str]):
    """

    id: str
    connector_key: str
    status: IntegrationSyncResponseRunStatus
    records_synced: int
    started_at: Union[None, datetime.datetime]
    finished_at: Union[None, datetime.datetime]
    error: Union[None, str]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        connector_key = self.connector_key

        status = self.status.value

        records_synced = self.records_synced

        started_at: Union[None, str]
        if isinstance(self.started_at, datetime.datetime):
            started_at = self.started_at.isoformat()
        else:
            started_at = self.started_at

        finished_at: Union[None, str]
        if isinstance(self.finished_at, datetime.datetime):
            finished_at = self.finished_at.isoformat()
        else:
            finished_at = self.finished_at

        error: Union[None, str]
        error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "connector_key": connector_key,
                "status": status,
                "records_synced": records_synced,
                "started_at": started_at,
                "finished_at": finished_at,
                "error": error,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        connector_key = d.pop("connector_key")

        status = IntegrationSyncResponseRunStatus(d.pop("status"))

        records_synced = d.pop("records_synced")

        def _parse_started_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                started_at_type_1 = isoparse(data)

                return started_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        started_at = _parse_started_at(d.pop("started_at"))

        def _parse_finished_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                finished_at_type_1 = isoparse(data)

                return finished_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        finished_at = _parse_finished_at(d.pop("finished_at"))

        def _parse_error(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        error = _parse_error(d.pop("error"))

        integration_sync_response_run = cls(
            id=id,
            connector_key=connector_key,
            status=status,
            records_synced=records_synced,
            started_at=started_at,
            finished_at=finished_at,
            error=error,
        )

        return integration_sync_response_run
