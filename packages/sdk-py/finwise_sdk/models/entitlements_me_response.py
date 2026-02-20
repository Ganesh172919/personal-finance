from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.entitlement_status import EntitlementStatus
from ..models.plan_tier import PlanTier
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.entitlement_credits import EntitlementCredits
    from ..models.entitlements_me_response_usage import EntitlementsMeResponseUsage
    from ..models.plan_limit import PlanLimit


T = TypeVar("T", bound="EntitlementsMeResponse")


@_attrs_define
class EntitlementsMeResponse:
    """
    Attributes:
        plan (PlanTier):
        status (EntitlementStatus):
        base_limits (PlanLimit):
        credits_ (EntitlementCredits):
        limits (PlanLimit):
        usage (EntitlementsMeResponseUsage):
        remaining (PlanLimit):
        period_key (str):
        request_id (str):
        org_id (Union[Unset, str]):
    """

    plan: PlanTier
    status: EntitlementStatus
    base_limits: "PlanLimit"
    credits_: "EntitlementCredits"
    limits: "PlanLimit"
    usage: "EntitlementsMeResponseUsage"
    remaining: "PlanLimit"
    period_key: str
    request_id: str
    org_id: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        plan = self.plan.value

        status = self.status.value

        base_limits = self.base_limits.to_dict()

        credits_ = self.credits_.to_dict()

        limits = self.limits.to_dict()

        usage = self.usage.to_dict()

        remaining = self.remaining.to_dict()

        period_key = self.period_key

        request_id = self.request_id

        org_id = self.org_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plan": plan,
                "status": status,
                "base_limits": base_limits,
                "credits": credits_,
                "limits": limits,
                "usage": usage,
                "remaining": remaining,
                "period_key": period_key,
                "request_id": request_id,
            }
        )
        if org_id is not UNSET:
            field_dict["org_id"] = org_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.entitlement_credits import EntitlementCredits
        from ..models.entitlements_me_response_usage import EntitlementsMeResponseUsage
        from ..models.plan_limit import PlanLimit

        d = src_dict.copy()
        plan = PlanTier(d.pop("plan"))

        status = EntitlementStatus(d.pop("status"))

        base_limits = PlanLimit.from_dict(d.pop("base_limits"))

        credits_ = EntitlementCredits.from_dict(d.pop("credits"))

        limits = PlanLimit.from_dict(d.pop("limits"))

        usage = EntitlementsMeResponseUsage.from_dict(d.pop("usage"))

        remaining = PlanLimit.from_dict(d.pop("remaining"))

        period_key = d.pop("period_key")

        request_id = d.pop("request_id")

        org_id = d.pop("org_id", UNSET)

        entitlements_me_response = cls(
            plan=plan,
            status=status,
            base_limits=base_limits,
            credits_=credits_,
            limits=limits,
            usage=usage,
            remaining=remaining,
            period_key=period_key,
            request_id=request_id,
            org_id=org_id,
        )

        return entitlements_me_response
