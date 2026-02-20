from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..models.entitlement_status import EntitlementStatus
from ..models.plan_tier import PlanTier

if TYPE_CHECKING:
    from ..models.entitlement_credits import EntitlementCredits
    from ..models.entitlement_snapshot_usage import EntitlementSnapshotUsage
    from ..models.plan_limit import PlanLimit


T = TypeVar("T", bound="EntitlementSnapshot")


@_attrs_define
class EntitlementSnapshot:
    """
    Attributes:
        plan (PlanTier):
        status (EntitlementStatus):
        base_limits (PlanLimit):
        credits_ (EntitlementCredits):
        limits (PlanLimit):
        usage (EntitlementSnapshotUsage):
        remaining (PlanLimit):
        period_key (str):
    """

    plan: PlanTier
    status: EntitlementStatus
    base_limits: "PlanLimit"
    credits_: "EntitlementCredits"
    limits: "PlanLimit"
    usage: "EntitlementSnapshotUsage"
    remaining: "PlanLimit"
    period_key: str

    def to_dict(self) -> dict[str, Any]:
        plan = self.plan.value

        status = self.status.value

        base_limits = self.base_limits.to_dict()

        credits_ = self.credits_.to_dict()

        limits = self.limits.to_dict()

        usage = self.usage.to_dict()

        remaining = self.remaining.to_dict()

        period_key = self.period_key

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
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.entitlement_credits import EntitlementCredits
        from ..models.entitlement_snapshot_usage import EntitlementSnapshotUsage
        from ..models.plan_limit import PlanLimit

        d = src_dict.copy()
        plan = PlanTier(d.pop("plan"))

        status = EntitlementStatus(d.pop("status"))

        base_limits = PlanLimit.from_dict(d.pop("base_limits"))

        credits_ = EntitlementCredits.from_dict(d.pop("credits"))

        limits = PlanLimit.from_dict(d.pop("limits"))

        usage = EntitlementSnapshotUsage.from_dict(d.pop("usage"))

        remaining = PlanLimit.from_dict(d.pop("remaining"))

        period_key = d.pop("period_key")

        entitlement_snapshot = cls(
            plan=plan,
            status=status,
            base_limits=base_limits,
            credits_=credits_,
            limits=limits,
            usage=usage,
            remaining=remaining,
            period_key=period_key,
        )

        return entitlement_snapshot
