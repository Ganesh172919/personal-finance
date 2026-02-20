from enum import Enum


class AuditActorType(str, Enum):
    API_KEY = "api_key"
    SYSTEM = "system"
    USER = "user"

    def __str__(self) -> str:
        return str(self.value)
