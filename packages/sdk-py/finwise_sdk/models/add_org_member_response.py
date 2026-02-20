from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.add_org_member_response_org import AddOrgMemberResponseOrg
    from ..models.org_invite_created import OrgInviteCreated
    from ..models.org_member import OrgMember


T = TypeVar("T", bound="AddOrgMemberResponse")


@_attrs_define
class AddOrgMemberResponse:
    """
    Attributes:
        org (AddOrgMemberResponseOrg):
        member (Union['OrgMember', None]):
        invite (Union['OrgInviteCreated', None]):
        request_id (str):
    """

    org: "AddOrgMemberResponseOrg"
    member: Union["OrgMember", None]
    invite: Union["OrgInviteCreated", None]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        from ..models.org_invite_created import OrgInviteCreated
        from ..models.org_member import OrgMember

        org = self.org.to_dict()

        member: Union[None, dict[str, Any]]
        if isinstance(self.member, OrgMember):
            member = self.member.to_dict()
        else:
            member = self.member

        invite: Union[None, dict[str, Any]]
        if isinstance(self.invite, OrgInviteCreated):
            invite = self.invite.to_dict()
        else:
            invite = self.invite

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org": org,
                "member": member,
                "invite": invite,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.add_org_member_response_org import AddOrgMemberResponseOrg
        from ..models.org_invite_created import OrgInviteCreated
        from ..models.org_member import OrgMember

        d = src_dict.copy()
        org = AddOrgMemberResponseOrg.from_dict(d.pop("org"))

        def _parse_member(data: object) -> Union["OrgMember", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                member_type_1 = OrgMember.from_dict(data)

                return member_type_1
            except:  # noqa: E722
                pass
            return cast(Union["OrgMember", None], data)

        member = _parse_member(d.pop("member"))

        def _parse_invite(data: object) -> Union["OrgInviteCreated", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                invite_type_1 = OrgInviteCreated.from_dict(data)

                return invite_type_1
            except:  # noqa: E722
                pass
            return cast(Union["OrgInviteCreated", None], data)

        invite = _parse_invite(d.pop("invite"))

        request_id = d.pop("request_id")

        add_org_member_response = cls(
            org=org,
            member=member,
            invite=invite,
            request_id=request_id,
        )

        return add_org_member_response
