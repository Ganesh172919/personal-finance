from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.notification import Notification


T = TypeVar("T", bound="MarkNotificationReadResponse")


@_attrs_define
class MarkNotificationReadResponse:
    """
    Attributes:
        org_id (str):
        notification (Notification):
        request_id (str):
    """

    org_id: str
    notification: "Notification"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        notification = self.notification.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "notification": notification,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.notification import Notification

        d = src_dict.copy()
        org_id = d.pop("org_id")

        notification = Notification.from_dict(d.pop("notification"))

        request_id = d.pop("request_id")

        mark_notification_read_response = cls(
            org_id=org_id,
            notification=notification,
            request_id=request_id,
        )

        return mark_notification_read_response
