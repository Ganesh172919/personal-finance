from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.merchant import Merchant


T = TypeVar("T", bound="UpsertMerchantResponse")


@_attrs_define
class UpsertMerchantResponse:
    """
    Attributes:
        org_id (str):
        merchant (Merchant):
        request_id (str):
    """

    org_id: str
    merchant: "Merchant"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        merchant = self.merchant.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "merchant": merchant,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.merchant import Merchant

        d = src_dict.copy()
        org_id = d.pop("org_id")

        merchant = Merchant.from_dict(d.pop("merchant"))

        request_id = d.pop("request_id")

        upsert_merchant_response = cls(
            org_id=org_id,
            merchant=merchant,
            request_id=request_id,
        )

        return upsert_merchant_response
