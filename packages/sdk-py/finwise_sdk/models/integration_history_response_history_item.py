import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="IntegrationHistoryResponseHistoryItem")


@_attrs_define
class IntegrationHistoryResponseHistoryItem:
    """
    Attributes:
        id (str):
        status (str):
        records_synced (int):
        started_at (Union[None, datetime.datetime]):
        finished_at (Union[None, datetime.datetime]):
        error (Union[None, str]):
        request_id (Union[None, str]):
        created_at (Union[None, datetime.datetime]):
    """

    id: str
    status: str
    records_synced: int
    started_at: Union[None, datetime.datetime]
    finished_at: Union[None, datetime.datetime]
    error: Union[None, str]
    request_id: Union[None, str]
    created_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        status = self.status

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

        request_id: Union[None, str]
        request_id = self.request_id

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "status": status,
                "records_synced": records_synced,
                "started_at": started_at,
                "finished_at": finished_at,
                "error": error,
                "request_id": request_id,
                "created_at": created_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        status = d.pop("status")

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

        def _parse_request_id(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        request_id = _parse_request_id(d.pop("request_id"))

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

        integration_history_response_history_item = cls(
            id=id,
            status=status,
            records_synced=records_synced,
            started_at=started_at,
            finished_at=finished_at,
            error=error,
            request_id=request_id,
            created_at=created_at,
        )

        return integration_history_response_history_item
