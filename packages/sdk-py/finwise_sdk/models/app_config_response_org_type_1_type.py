from enum import Enum


class AppConfigResponseOrgType1Type(str, Enum):
    PERSONAL = "personal"
    TEAM = "team"

    def __str__(self) -> str:
        return str(self.value)
