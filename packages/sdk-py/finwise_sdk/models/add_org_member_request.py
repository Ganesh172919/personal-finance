from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.org_role import OrgRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="AddOrgMemberRequest")


@_attrs_define
class AddOrgMemberRequest:
    """
    Attributes:
        email (str):
        role (Union[Unset, OrgRole]):
    """

    email: str
    role: Union[Unset, OrgRole] = UNSET

    def to_dict(self) -> dict[str, Any]:
        email = self.email

        role: Union[Unset, str] = UNSET
        if not isinstance(self.role, Unset):
            role = self.role.value

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "email": email,
            }
        )
        if role is not UNSET:
            field_dict["role"] = role

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email")

        _role = d.pop("role", UNSET)
        role: Union[Unset, OrgRole]
        if isinstance(_role, Unset):
            role = UNSET
        else:
            role = OrgRole(_role)

        add_org_member_request = cls(
            email=email,
            role=role,
        )

        return add_org_member_request
