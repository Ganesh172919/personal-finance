from enum import Enum


class NotificationStatus(str, Enum):
    READ = "read"
    UNREAD = "unread"

    def __str__(self) -> str:
        return str(self.value)
