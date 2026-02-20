from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..models.billing_provider import BillingProvider
from ..types import UNSET, Unset

T = TypeVar("T", bound="BillingCheckoutResponse")


@_attrs_define
class BillingCheckoutResponse:
    """
    Attributes:
        provider (BillingProvider):
        checkout_url (Union[None, str]):
        activated (bool):
        request_id (str):
        session_id (Union[Unset, str]):
    """

    provider: BillingProvider
    checkout_url: Union[None, str]
    activated: bool
    request_id: str
    session_id: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        provider = self.provider.value

        checkout_url: Union[None, str]
        checkout_url = self.checkout_url

        activated = self.activated

        request_id = self.request_id

        session_id = self.session_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "provider": provider,
                "checkout_url": checkout_url,
                "activated": activated,
                "request_id": request_id,
            }
        )
        if session_id is not UNSET:
            field_dict["session_id"] = session_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        provider = BillingProvider(d.pop("provider"))

        def _parse_checkout_url(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        checkout_url = _parse_checkout_url(d.pop("checkout_url"))

        activated = d.pop("activated")

        request_id = d.pop("request_id")

        session_id = d.pop("session_id", UNSET)

        billing_checkout_response = cls(
            provider=provider,
            checkout_url=checkout_url,
            activated=activated,
            request_id=request_id,
            session_id=session_id,
        )

        return billing_checkout_response
