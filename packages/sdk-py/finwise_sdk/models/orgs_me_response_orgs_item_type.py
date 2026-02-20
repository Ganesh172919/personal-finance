from enum import Enum


class OrgsMeResponseOrgsItemType(str, Enum):
    PERSONAL = "personal"
    TEAM = "team"

    def __str__(self) -> str:
        return str(self.value)
