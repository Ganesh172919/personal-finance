from enum import Enum


class NotificationsListStatus(str, Enum):
    READ = "read"
    UNREAD = "unread"

    def __str__(self) -> str:
        return str(self.value)
