from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.billing_checkout_request_plan_tier import BillingCheckoutRequestPlanTier
from ..types import UNSET, Unset

T = TypeVar("T", bound="BillingCheckoutRequest")


@_attrs_define
class BillingCheckoutRequest:
    """
    Attributes:
        plan_tier (BillingCheckoutRequestPlanTier):
        seats (Union[Unset, int]):
        success_url (Union[Unset, str]):
        cancel_url (Union[Unset, str]):
    """

    plan_tier: BillingCheckoutRequestPlanTier
    seats: Union[Unset, int] = UNSET
    success_url: Union[Unset, str] = UNSET
    cancel_url: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        plan_tier = self.plan_tier.value

        seats = self.seats

        success_url = self.success_url

        cancel_url = self.cancel_url

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plan_tier": plan_tier,
            }
        )
        if seats is not UNSET:
            field_dict["seats"] = seats
        if success_url is not UNSET:
            field_dict["success_url"] = success_url
        if cancel_url is not UNSET:
            field_dict["cancel_url"] = cancel_url

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        plan_tier = BillingCheckoutRequestPlanTier(d.pop("plan_tier"))

        seats = d.pop("seats", UNSET)

        success_url = d.pop("success_url", UNSET)

        cancel_url = d.pop("cancel_url", UNSET)

        billing_checkout_request = cls(
            plan_tier=plan_tier,
            seats=seats,
            success_url=success_url,
            cancel_url=cancel_url,
        )

        return billing_checkout_request
