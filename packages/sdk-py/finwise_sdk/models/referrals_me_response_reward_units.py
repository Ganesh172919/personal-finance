from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ReferralsMeResponseRewardUnits")


@_attrs_define
class ReferralsMeResponseRewardUnits:
    """
    Attributes:
        monthly_ai_calls (int):
        api_requests (int):
        workflow_runs (int):
        marketplace_installs (int):
    """

    monthly_ai_calls: int
    api_requests: int
    workflow_runs: int
    marketplace_installs: int

    def to_dict(self) -> dict[str, Any]:
        monthly_ai_calls = self.monthly_ai_calls

        api_requests = self.api_requests

        workflow_runs = self.workflow_runs

        marketplace_installs = self.marketplace_installs

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "monthly_ai_calls": monthly_ai_calls,
                "api_requests": api_requests,
                "workflow_runs": workflow_runs,
                "marketplace_installs": marketplace_installs,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        monthly_ai_calls = d.pop("monthly_ai_calls")

        api_requests = d.pop("api_requests")

        workflow_runs = d.pop("workflow_runs")

        marketplace_installs = d.pop("marketplace_installs")

        referrals_me_response_reward_units = cls(
            monthly_ai_calls=monthly_ai_calls,
            api_requests=api_requests,
            workflow_runs=workflow_runs,
            marketplace_installs=marketplace_installs,
        )

        return referrals_me_response_reward_units
