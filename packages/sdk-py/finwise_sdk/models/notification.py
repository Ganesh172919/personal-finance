import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.notification_status import NotificationStatus

if TYPE_CHECKING:
    from ..models.notification_metadata import NotificationMetadata


T = TypeVar("T", bound="Notification")


@_attrs_define
class Notification:
    """
    Attributes:
        id (str):
        status (NotificationStatus):
        title (str):
        message (str):
        read_at (Union[None, datetime.datetime]):
        created_at (Union[None, datetime.datetime]):
        metadata (NotificationMetadata):
    """

    id: str
    status: NotificationStatus
    title: str
    message: str
    read_at: Union[None, datetime.datetime]
    created_at: Union[None, datetime.datetime]
    metadata: "NotificationMetadata"

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        status = self.status.value

        title = self.title

        message = self.message

        read_at: Union[None, str]
        if isinstance(self.read_at, datetime.datetime):
            read_at = self.read_at.isoformat()
        else:
            read_at = self.read_at

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "status": status,
                "title": title,
                "message": message,
                "read_at": read_at,
                "created_at": created_at,
                "metadata": metadata,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.notification_metadata import NotificationMetadata

        d = src_dict.copy()
        id = d.pop("id")

        status = NotificationStatus(d.pop("status"))

        title = d.pop("title")

        message = d.pop("message")

        def _parse_read_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                read_at_type_1 = isoparse(data)

                return read_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        read_at = _parse_read_at(d.pop("read_at"))

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

        metadata = NotificationMetadata.from_dict(d.pop("metadata"))

        notification = cls(
            id=id,
            status=status,
            title=title,
            message=message,
            read_at=read_at,
            created_at=created_at,
            metadata=metadata,
        )

        return notification
