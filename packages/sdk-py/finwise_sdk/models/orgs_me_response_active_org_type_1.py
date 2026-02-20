from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.org_role import OrgRole

T = TypeVar("T", bound="OrgsMeResponseActiveOrgType1")


@_attrs_define
class OrgsMeResponseActiveOrgType1:
    """
    Attributes:
        id (str):
        role (OrgRole):
        member_id (str):
    """

    id: str
    role: OrgRole
    member_id: str

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        role = self.role.value

        member_id = self.member_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "role": role,
                "member_id": member_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        role = OrgRole(d.pop("role"))

        member_id = d.pop("member_id")

        orgs_me_response_active_org_type_1 = cls(
            id=id,
            role=role,
            member_id=member_id,
        )

        return orgs_me_response_active_org_type_1
