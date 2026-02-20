from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="StripeWebhookResponse200")


@_attrs_define
class StripeWebhookResponse200:
    """
    Attributes:
        received (bool):
        request_id (str):
    """

    received: bool
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        received = self.received

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "received": received,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        received = d.pop("received")

        request_id = d.pop("request_id")

        stripe_webhook_response_200 = cls(
            received=received,
            request_id=request_id,
        )

        return stripe_webhook_response_200
