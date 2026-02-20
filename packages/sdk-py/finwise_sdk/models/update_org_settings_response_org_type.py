from enum import Enum


class UpdateOrgSettingsResponseOrgType(str, Enum):
    PERSONAL = "personal"
    TEAM = "team"

    def __str__(self) -> str:
        return str(self.value)
