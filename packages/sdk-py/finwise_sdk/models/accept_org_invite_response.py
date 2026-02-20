from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.accept_org_invite_response_member_type_1 import (
        AcceptOrgInviteResponseMemberType1,
    )
    from ..models.org_invite_accepted import OrgInviteAccepted


T = TypeVar("T", bound="AcceptOrgInviteResponse")


@_attrs_define
class AcceptOrgInviteResponse:
    """
    Attributes:
        invite (OrgInviteAccepted):
        member (Union['AcceptOrgInviteResponseMemberType1', None]):
        request_id (str):
    """

    invite: "OrgInviteAccepted"
    member: Union["AcceptOrgInviteResponseMemberType1", None]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        from ..models.accept_org_invite_response_member_type_1 import (
            AcceptOrgInviteResponseMemberType1,
        )

        invite = self.invite.to_dict()

        member: Union[None, dict[str, Any]]
        if isinstance(self.member, AcceptOrgInviteResponseMemberType1):
            member = self.member.to_dict()
        else:
            member = self.member

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "invite": invite,
                "member": member,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.accept_org_invite_response_member_type_1 import (
            AcceptOrgInviteResponseMemberType1,
        )
        from ..models.org_invite_accepted import OrgInviteAccepted

        d = src_dict.copy()
        invite = OrgInviteAccepted.from_dict(d.pop("invite"))

        def _parse_member(
            data: object,
        ) -> Union["AcceptOrgInviteResponseMemberType1", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                member_type_1 = AcceptOrgInviteResponseMemberType1.from_dict(data)

                return member_type_1
            except:  # noqa: E722
                pass
            return cast(Union["AcceptOrgInviteResponseMemberType1", None], data)

        member = _parse_member(d.pop("member"))

        request_id = d.pop("request_id")

        accept_org_invite_response = cls(
            invite=invite,
            member=member,
            request_id=request_id,
        )

        return accept_org_invite_response
