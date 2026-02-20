from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.merchant import Merchant


T = TypeVar("T", bound="ListMerchantsResponse")


@_attrs_define
class ListMerchantsResponse:
    """
    Attributes:
        org_id (str):
        merchants (list['Merchant']):
        request_id (str):
    """

    org_id: str
    merchants: list["Merchant"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        merchants = []
        for merchants_item_data in self.merchants:
            merchants_item = merchants_item_data.to_dict()
            merchants.append(merchants_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "merchants": merchants,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.merchant import Merchant

        d = src_dict.copy()
        org_id = d.pop("org_id")

        merchants = []
        _merchants = d.pop("merchants")
        for merchants_item_data in _merchants:
            merchants_item = Merchant.from_dict(merchants_item_data)

            merchants.append(merchants_item)

        request_id = d.pop("request_id")

        list_merchants_response = cls(
            org_id=org_id,
            merchants=merchants,
            request_id=request_id,
        )

        return list_merchants_response
