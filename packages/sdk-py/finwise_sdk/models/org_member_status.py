from enum import Enum


class OrgMemberStatus(str, Enum):
    ACTIVE = "active"
    INVITED = "invited"
    REMOVED = "removed"

    def __str__(self) -> str:
        return str(self.value)
