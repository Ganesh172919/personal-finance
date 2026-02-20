from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.billing_provider import BillingProvider

T = TypeVar("T", bound="BillingPortalResponse")


@_attrs_define
class BillingPortalResponse:
    """
    Attributes:
        provider (BillingProvider):
        portal_url (str):
        request_id (str):
    """

    provider: BillingProvider
    portal_url: str
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        provider = self.provider.value

        portal_url = self.portal_url

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "provider": provider,
                "portal_url": portal_url,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        provider = BillingProvider(d.pop("provider"))

        portal_url = d.pop("portal_url")

        request_id = d.pop("request_id")

        billing_portal_response = cls(
            provider=provider,
            portal_url=portal_url,
            request_id=request_id,
        )

        return billing_portal_response
