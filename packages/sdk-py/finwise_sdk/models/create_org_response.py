from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.create_org_response_org import CreateOrgResponseOrg


T = TypeVar("T", bound="CreateOrgResponse")


@_attrs_define
class CreateOrgResponse:
    """
    Attributes:
        org (CreateOrgResponseOrg):
        request_id (str):
    """

    org: "CreateOrgResponseOrg"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org = self.org.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org": org,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_org_response_org import CreateOrgResponseOrg

        d = src_dict.copy()
        org = CreateOrgResponseOrg.from_dict(d.pop("org"))

        request_id = d.pop("request_id")

        create_org_response = cls(
            org=org,
            request_id=request_id,
        )

        return create_org_response
