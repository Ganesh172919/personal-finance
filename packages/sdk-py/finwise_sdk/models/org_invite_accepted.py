import datetime
from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.org_invite_status import OrgInviteStatus
from ..models.org_role import OrgRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="OrgInviteAccepted")


@_attrs_define
class OrgInviteAccepted:
    """
    Attributes:
        id (str):
        org_id (str):
        email (str):
        role (OrgRole):
        status (OrgInviteStatus):
        accepted_at (Union[Unset, datetime.datetime]):
    """

    id: str
    org_id: str
    email: str
    role: OrgRole
    status: OrgInviteStatus
    accepted_at: Union[Unset, datetime.datetime] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        org_id = self.org_id

        email = self.email

        role = self.role.value

        status = self.status.value

        accepted_at: Union[Unset, str] = UNSET
        if not isinstance(self.accepted_at, Unset):
            accepted_at = self.accepted_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "org_id": org_id,
                "email": email,
                "role": role,
                "status": status,
            }
        )
        if accepted_at is not UNSET:
            field_dict["accepted_at"] = accepted_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        org_id = d.pop("org_id")

        email = d.pop("email")

        role = OrgRole(d.pop("role"))

        status = OrgInviteStatus(d.pop("status"))

        _accepted_at = d.pop("accepted_at", UNSET)
        accepted_at: Union[Unset, datetime.datetime]
        if isinstance(_accepted_at, Unset):
            accepted_at = UNSET
        else:
            accepted_at = isoparse(_accepted_at)

        org_invite_accepted = cls(
            id=id,
            org_id=org_id,
            email=email,
            role=role,
            status=status,
            accepted_at=accepted_at,
        )

        return org_invite_accepted
