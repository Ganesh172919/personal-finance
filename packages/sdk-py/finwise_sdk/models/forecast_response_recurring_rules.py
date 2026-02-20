from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.forecast_response_recurring_rules_by_category_item import (
        ForecastResponseRecurringRulesByCategoryItem,
    )


T = TypeVar("T", bound="ForecastResponseRecurringRules")


@_attrs_define
class ForecastResponseRecurringRules:
    """
    Attributes:
        active_rules (int):
        expense_expected_monthly (float):
        by_category (list['ForecastResponseRecurringRulesByCategoryItem']):
    """

    active_rules: int
    expense_expected_monthly: float
    by_category: list["ForecastResponseRecurringRulesByCategoryItem"]

    def to_dict(self) -> dict[str, Any]:
        active_rules = self.active_rules

        expense_expected_monthly = self.expense_expected_monthly

        by_category = []
        for by_category_item_data in self.by_category:
            by_category_item = by_category_item_data.to_dict()
            by_category.append(by_category_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "active_rules": active_rules,
                "expense_expected_monthly": expense_expected_monthly,
                "by_category": by_category,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.forecast_response_recurring_rules_by_category_item import (
            ForecastResponseRecurringRulesByCategoryItem,
        )

        d = src_dict.copy()
        active_rules = d.pop("active_rules")

        expense_expected_monthly = d.pop("expense_expected_monthly")

        by_category = []
        _by_category = d.pop("by_category")
        for by_category_item_data in _by_category:
            by_category_item = ForecastResponseRecurringRulesByCategoryItem.from_dict(
                by_category_item_data
            )

            by_category.append(by_category_item)

        forecast_response_recurring_rules = cls(
            active_rules=active_rules,
            expense_expected_monthly=expense_expected_monthly,
            by_category=by_category,
        )

        return forecast_response_recurring_rules
