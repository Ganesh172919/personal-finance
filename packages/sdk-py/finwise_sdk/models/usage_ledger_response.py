from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..models.plan_tier import PlanTier

if TYPE_CHECKING:
    from ..models.entitlement_credits import EntitlementCredits
    from ..models.plan_limit import PlanLimit
    from ..models.usage_ledger_response_usage import UsageLedgerResponseUsage
    from ..models.usage_ledger_row import UsageLedgerRow


T = TypeVar("T", bound="UsageLedgerResponse")


@_attrs_define
class UsageLedgerResponse:
    """
    Attributes:
        org_id (str):
        period_key (str):
        plan (PlanTier):
        status (str):
        base_limits (PlanLimit):
        credits_ (EntitlementCredits):
        limits (PlanLimit):
        usage (UsageLedgerResponseUsage):
        remaining (PlanLimit):
        ledger (list['UsageLedgerRow']):
        request_id (str):
    """

    org_id: str
    period_key: str
    plan: PlanTier
    status: str
    base_limits: "PlanLimit"
    credits_: "EntitlementCredits"
    limits: "PlanLimit"
    usage: "UsageLedgerResponseUsage"
    remaining: "PlanLimit"
    ledger: list["UsageLedgerRow"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        period_key = self.period_key

        plan = self.plan.value

        status = self.status

        base_limits = self.base_limits.to_dict()

        credits_ = self.credits_.to_dict()

        limits = self.limits.to_dict()

        usage = self.usage.to_dict()

        remaining = self.remaining.to_dict()

        ledger = []
        for ledger_item_data in self.ledger:
            ledger_item = ledger_item_data.to_dict()
            ledger.append(ledger_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "period_key": period_key,
                "plan": plan,
                "status": status,
                "base_limits": base_limits,
                "credits": credits_,
                "limits": limits,
                "usage": usage,
                "remaining": remaining,
                "ledger": ledger,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.entitlement_credits import EntitlementCredits
        from ..models.plan_limit import PlanLimit
        from ..models.usage_ledger_response_usage import UsageLedgerResponseUsage
        from ..models.usage_ledger_row import UsageLedgerRow

        d = src_dict.copy()
        org_id = d.pop("org_id")

        period_key = d.pop("period_key")

        plan = PlanTier(d.pop("plan"))

        status = d.pop("status")

        base_limits = PlanLimit.from_dict(d.pop("base_limits"))

        credits_ = EntitlementCredits.from_dict(d.pop("credits"))

        limits = PlanLimit.from_dict(d.pop("limits"))

        usage = UsageLedgerResponseUsage.from_dict(d.pop("usage"))

        remaining = PlanLimit.from_dict(d.pop("remaining"))

        ledger = []
        _ledger = d.pop("ledger")
        for ledger_item_data in _ledger:
            ledger_item = UsageLedgerRow.from_dict(ledger_item_data)

            ledger.append(ledger_item)

        request_id = d.pop("request_id")

        usage_ledger_response = cls(
            org_id=org_id,
            period_key=period_key,
            plan=plan,
            status=status,
            base_limits=base_limits,
            credits_=credits_,
            limits=limits,
            usage=usage,
            remaining=remaining,
            ledger=ledger,
            request_id=request_id,
        )

        return usage_ledger_response
