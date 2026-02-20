from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.orgs_me_response_active_org_type_1 import OrgsMeResponseActiveOrgType1
    from ..models.orgs_me_response_orgs_item import OrgsMeResponseOrgsItem


T = TypeVar("T", bound="OrgsMeResponse")


@_attrs_define
class OrgsMeResponse:
    """
    Attributes:
        active_org (Union['OrgsMeResponseActiveOrgType1', None]):
        orgs (list['OrgsMeResponseOrgsItem']):
        request_id (str):
    """

    active_org: Union["OrgsMeResponseActiveOrgType1", None]
    orgs: list["OrgsMeResponseOrgsItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        from ..models.orgs_me_response_active_org_type_1 import (
            OrgsMeResponseActiveOrgType1,
        )

        active_org: Union[None, dict[str, Any]]
        if isinstance(self.active_org, OrgsMeResponseActiveOrgType1):
            active_org = self.active_org.to_dict()
        else:
            active_org = self.active_org

        orgs = []
        for orgs_item_data in self.orgs:
            orgs_item = orgs_item_data.to_dict()
            orgs.append(orgs_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "active_org": active_org,
                "orgs": orgs,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.orgs_me_response_active_org_type_1 import (
            OrgsMeResponseActiveOrgType1,
        )
        from ..models.orgs_me_response_orgs_item import OrgsMeResponseOrgsItem

        d = src_dict.copy()

        def _parse_active_org(
            data: object,
        ) -> Union["OrgsMeResponseActiveOrgType1", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                active_org_type_1 = OrgsMeResponseActiveOrgType1.from_dict(data)

                return active_org_type_1
            except:  # noqa: E722
                pass
            return cast(Union["OrgsMeResponseActiveOrgType1", None], data)

        active_org = _parse_active_org(d.pop("active_org"))

        orgs = []
        _orgs = d.pop("orgs")
        for orgs_item_data in _orgs:
            orgs_item = OrgsMeResponseOrgsItem.from_dict(orgs_item_data)

            orgs.append(orgs_item)

        request_id = d.pop("request_id")

        orgs_me_response = cls(
            active_org=active_org,
            orgs=orgs,
            request_id=request_id,
        )

        return orgs_me_response
