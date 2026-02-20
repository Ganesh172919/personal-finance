from enum import Enum


class CreateOrgResponseOrgType(str, Enum):
    TEAM = "team"

    def __str__(self) -> str:
        return str(self.value)
