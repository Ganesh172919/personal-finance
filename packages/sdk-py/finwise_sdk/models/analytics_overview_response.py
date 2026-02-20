from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..models.entitlement_status import EntitlementStatus
from ..models.plan_tier import PlanTier

if TYPE_CHECKING:
    from ..models.analytics_overview_response_metrics import (
        AnalyticsOverviewResponseMetrics,
    )
    from ..models.analytics_overview_response_usage import (
        AnalyticsOverviewResponseUsage,
    )
    from ..models.plan_limit import PlanLimit


T = TypeVar("T", bound="AnalyticsOverviewResponse")


@_attrs_define
class AnalyticsOverviewResponse:
    """
    Attributes:
        org_id (str):
        period_key (str):
        plan (PlanTier):
        status (EntitlementStatus):
        metrics (AnalyticsOverviewResponseMetrics):
        usage (AnalyticsOverviewResponseUsage):
        limits (PlanLimit):
        remaining (PlanLimit):
        request_id (str):
    """

    org_id: str
    period_key: str
    plan: PlanTier
    status: EntitlementStatus
    metrics: "AnalyticsOverviewResponseMetrics"
    usage: "AnalyticsOverviewResponseUsage"
    limits: "PlanLimit"
    remaining: "PlanLimit"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        period_key = self.period_key

        plan = self.plan.value

        status = self.status.value

        metrics = self.metrics.to_dict()

        usage = self.usage.to_dict()

        limits = self.limits.to_dict()

        remaining = self.remaining.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "period_key": period_key,
                "plan": plan,
                "status": status,
                "metrics": metrics,
                "usage": usage,
                "limits": limits,
                "remaining": remaining,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.analytics_overview_response_metrics import (
            AnalyticsOverviewResponseMetrics,
        )
        from ..models.analytics_overview_response_usage import (
            AnalyticsOverviewResponseUsage,
        )
        from ..models.plan_limit import PlanLimit

        d = src_dict.copy()
        org_id = d.pop("org_id")

        period_key = d.pop("period_key")

        plan = PlanTier(d.pop("plan"))

        status = EntitlementStatus(d.pop("status"))

        metrics = AnalyticsOverviewResponseMetrics.from_dict(d.pop("metrics"))

        usage = AnalyticsOverviewResponseUsage.from_dict(d.pop("usage"))

        limits = PlanLimit.from_dict(d.pop("limits"))

        remaining = PlanLimit.from_dict(d.pop("remaining"))

        request_id = d.pop("request_id")

        analytics_overview_response = cls(
            org_id=org_id,
            period_key=period_key,
            plan=plan,
            status=status,
            metrics=metrics,
            usage=usage,
            limits=limits,
            remaining=remaining,
            request_id=request_id,
        )

        return analytics_overview_response
