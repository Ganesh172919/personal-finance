from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AcceptOrgInviteRequest")


@_attrs_define
class AcceptOrgInviteRequest:
    """
    Attributes:
        token (str):
    """

    token: str

    def to_dict(self) -> dict[str, Any]:
        token = self.token

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "token": token,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        token = d.pop("token")

        accept_org_invite_request = cls(
            token=token,
        )

        return accept_org_invite_request
