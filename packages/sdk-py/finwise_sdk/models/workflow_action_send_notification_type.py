from enum import Enum


class WorkflowActionSendNotificationType(str, Enum):
    SEND_NOTIFICATION = "send_notification"

    def __str__(self) -> str:
        return str(self.value)
