import datetime
from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.org_invite_status import OrgInviteStatus
from ..models.org_role import OrgRole
from ..types import UNSET, Unset

T = TypeVar("T", bound="OrgInviteCreated")


@_attrs_define
class OrgInviteCreated:
    """
    Attributes:
        id (str):
        email (str):
        role (OrgRole):
        status (OrgInviteStatus):
        expires_at (datetime.datetime):
        token_prefix (str):
        token (Union[Unset, str]):
    """

    id: str
    email: str
    role: OrgRole
    status: OrgInviteStatus
    expires_at: datetime.datetime
    token_prefix: str
    token: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        email = self.email

        role = self.role.value

        status = self.status.value

        expires_at = self.expires_at.isoformat()

        token_prefix = self.token_prefix

        token = self.token

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "email": email,
                "role": role,
                "status": status,
                "expires_at": expires_at,
                "token_prefix": token_prefix,
            }
        )
        if token is not UNSET:
            field_dict["token"] = token

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        email = d.pop("email")

        role = OrgRole(d.pop("role"))

        status = OrgInviteStatus(d.pop("status"))

        expires_at = isoparse(d.pop("expires_at"))

        token_prefix = d.pop("token_prefix")

        token = d.pop("token", UNSET)

        org_invite_created = cls(
            id=id,
            email=email,
            role=role,
            status=status,
            expires_at=expires_at,
            token_prefix=token_prefix,
            token=token,
        )

        return org_invite_created
