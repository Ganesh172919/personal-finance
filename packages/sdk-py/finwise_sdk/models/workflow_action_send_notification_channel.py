from enum import Enum


class WorkflowActionSendNotificationChannel(str, Enum):
    EMAIL = "email"
    IN_APP = "in_app"

    def __str__(self) -> str:
        return str(self.value)
