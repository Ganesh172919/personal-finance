from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.org_member_status import OrgMemberStatus
from ..models.org_role import OrgRole

T = TypeVar("T", bound="OrgMember")


@_attrs_define
class OrgMember:
    """
    Attributes:
        id (str):
        user_id (str):
        role (OrgRole):
        status (OrgMemberStatus):
    """

    id: str
    user_id: str
    role: OrgRole
    status: OrgMemberStatus

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        user_id = self.user_id

        role = self.role.value

        status = self.status.value

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "user_id": user_id,
                "role": role,
                "status": status,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        user_id = d.pop("user_id")

        role = OrgRole(d.pop("role"))

        status = OrgMemberStatus(d.pop("status"))

        org_member = cls(
            id=id,
            user_id=user_id,
            role=role,
            status=status,
        )

        return org_member
