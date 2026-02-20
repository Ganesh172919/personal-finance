import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.export_job_status import ExportJobStatus
from ..models.export_job_type import ExportJobType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.export_job_params import ExportJobParams


T = TypeVar("T", bound="ExportJob")


@_attrs_define
class ExportJob:
    """
    Attributes:
        id (str):
        type_ (ExportJobType):
        status (ExportJobStatus):
        params (ExportJobParams):
        filename (Union[Unset, str]):
        content_type (Union[Unset, str]):
        bytes_ (Union[Unset, int]):
        started_at (Union[Unset, datetime.datetime]):
        finished_at (Union[Unset, datetime.datetime]):
        error (Union[Unset, str]):
        created_at (Union[Unset, datetime.datetime]):
        updated_at (Union[Unset, datetime.datetime]):
    """

    id: str
    type_: ExportJobType
    status: ExportJobStatus
    params: "ExportJobParams"
    filename: Union[Unset, str] = UNSET
    content_type: Union[Unset, str] = UNSET
    bytes_: Union[Unset, int] = UNSET
    started_at: Union[Unset, datetime.datetime] = UNSET
    finished_at: Union[Unset, datetime.datetime] = UNSET
    error: Union[Unset, str] = UNSET
    created_at: Union[Unset, datetime.datetime] = UNSET
    updated_at: Union[Unset, datetime.datetime] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        type_ = self.type_.value

        status = self.status.value

        params = self.params.to_dict()

        filename = self.filename

        content_type = self.content_type

        bytes_ = self.bytes_

        started_at: Union[Unset, str] = UNSET
        if not isinstance(self.started_at, Unset):
            started_at = self.started_at.isoformat()

        finished_at: Union[Unset, str] = UNSET
        if not isinstance(self.finished_at, Unset):
            finished_at = self.finished_at.isoformat()

        error = self.error

        created_at: Union[Unset, str] = UNSET
        if not isinstance(self.created_at, Unset):
            created_at = self.created_at.isoformat()

        updated_at: Union[Unset, str] = UNSET
        if not isinstance(self.updated_at, Unset):
            updated_at = self.updated_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "type": type_,
                "status": status,
                "params": params,
            }
        )
        if filename is not UNSET:
            field_dict["filename"] = filename
        if content_type is not UNSET:
            field_dict["content_type"] = content_type
        if bytes_ is not UNSET:
            field_dict["bytes"] = bytes_
        if started_at is not UNSET:
            field_dict["started_at"] = started_at
        if finished_at is not UNSET:
            field_dict["finished_at"] = finished_at
        if error is not UNSET:
            field_dict["error"] = error
        if created_at is not UNSET:
            field_dict["created_at"] = created_at
        if updated_at is not UNSET:
            field_dict["updated_at"] = updated_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.export_job_params import ExportJobParams

        d = src_dict.copy()
        id = d.pop("id")

        type_ = ExportJobType(d.pop("type"))

        status = ExportJobStatus(d.pop("status"))

        params = ExportJobParams.from_dict(d.pop("params"))

        filename = d.pop("filename", UNSET)

        content_type = d.pop("content_type", UNSET)

        bytes_ = d.pop("bytes", UNSET)

        _started_at = d.pop("started_at", UNSET)
        started_at: Union[Unset, datetime.datetime]
        if isinstance(_started_at, Unset):
            started_at = UNSET
        else:
            started_at = isoparse(_started_at)

        _finished_at = d.pop("finished_at", UNSET)
        finished_at: Union[Unset, datetime.datetime]
        if isinstance(_finished_at, Unset):
            finished_at = UNSET
        else:
            finished_at = isoparse(_finished_at)

        error = d.pop("error", UNSET)

        _created_at = d.pop("created_at", UNSET)
        created_at: Union[Unset, datetime.datetime]
        if isinstance(_created_at, Unset):
            created_at = UNSET
        else:
            created_at = isoparse(_created_at)

        _updated_at = d.pop("updated_at", UNSET)
        updated_at: Union[Unset, datetime.datetime]
        if isinstance(_updated_at, Unset):
            updated_at = UNSET
        else:
            updated_at = isoparse(_updated_at)

        export_job = cls(
            id=id,
            type_=type_,
            status=status,
            params=params,
            filename=filename,
            content_type=content_type,
            bytes_=bytes_,
            started_at=started_at,
            finished_at=finished_at,
            error=error,
            created_at=created_at,
            updated_at=updated_at,
        )

        return export_job
