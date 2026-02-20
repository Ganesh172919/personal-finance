from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.workflow_action_send_notification_channel import (
    WorkflowActionSendNotificationChannel,
)
from ..models.workflow_action_send_notification_type import (
    WorkflowActionSendNotificationType,
)
from ..types import UNSET, Unset

T = TypeVar("T", bound="WorkflowActionSendNotification")


@_attrs_define
class WorkflowActionSendNotification:
    """
    Attributes:
        type_ (WorkflowActionSendNotificationType):
        subject (str):
        message (str):
        channel (Union[Unset, WorkflowActionSendNotificationChannel]):
    """

    type_: WorkflowActionSendNotificationType
    subject: str
    message: str
    channel: Union[Unset, WorkflowActionSendNotificationChannel] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        subject = self.subject

        message = self.message

        channel: Union[Unset, str] = UNSET
        if not isinstance(self.channel, Unset):
            channel = self.channel.value

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "subject": subject,
                "message": message,
            }
        )
        if channel is not UNSET:
            field_dict["channel"] = channel

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        type_ = WorkflowActionSendNotificationType(d.pop("type"))

        subject = d.pop("subject")

        message = d.pop("message")

        _channel = d.pop("channel", UNSET)
        channel: Union[Unset, WorkflowActionSendNotificationChannel]
        if isinstance(_channel, Unset):
            channel = UNSET
        else:
            channel = WorkflowActionSendNotificationChannel(_channel)

        workflow_action_send_notification = cls(
            type_=type_,
            subject=subject,
            message=message,
            channel=channel,
        )

        return workflow_action_send_notification
