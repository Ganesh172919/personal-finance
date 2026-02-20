from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.notification import Notification


T = TypeVar("T", bound="ListNotificationsResponse")


@_attrs_define
class ListNotificationsResponse:
    """
    Attributes:
        org_id (str):
        notifications (list['Notification']):
        request_id (str):
    """

    org_id: str
    notifications: list["Notification"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        notifications = []
        for notifications_item_data in self.notifications:
            notifications_item = notifications_item_data.to_dict()
            notifications.append(notifications_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "notifications": notifications,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.notification import Notification

        d = src_dict.copy()
        org_id = d.pop("org_id")

        notifications = []
        _notifications = d.pop("notifications")
        for notifications_item_data in _notifications:
            notifications_item = Notification.from_dict(notifications_item_data)

            notifications.append(notifications_item)

        request_id = d.pop("request_id")

        list_notifications_response = cls(
            org_id=org_id,
            notifications=notifications,
            request_id=request_id,
        )

        return list_notifications_response
