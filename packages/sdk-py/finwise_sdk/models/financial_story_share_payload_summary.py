from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="FinancialStorySharePayloadSummary")


@_attrs_define
class FinancialStorySharePayloadSummary:
    """
    Attributes:
        health_percentage (int):
        total_assets (float):
        savings_balance (float):
        goals_active (int):
        milestones_count (int):
    """

    health_percentage: int
    total_assets: float
    savings_balance: float
    goals_active: int
    milestones_count: int

    def to_dict(self) -> dict[str, Any]:
        health_percentage = self.health_percentage

        total_assets = self.total_assets

        savings_balance = self.savings_balance

        goals_active = self.goals_active

        milestones_count = self.milestones_count

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "health_percentage": health_percentage,
                "total_assets": total_assets,
                "savings_balance": savings_balance,
                "goals_active": goals_active,
                "milestones_count": milestones_count,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        health_percentage = d.pop("health_percentage")

        total_assets = d.pop("total_assets")

        savings_balance = d.pop("savings_balance")

        goals_active = d.pop("goals_active")

        milestones_count = d.pop("milestones_count")

        financial_story_share_payload_summary = cls(
            health_percentage=health_percentage,
            total_assets=total_assets,
            savings_balance=savings_balance,
            goals_active=goals_active,
            milestones_count=milestones_count,
        )

        return financial_story_share_payload_summary
