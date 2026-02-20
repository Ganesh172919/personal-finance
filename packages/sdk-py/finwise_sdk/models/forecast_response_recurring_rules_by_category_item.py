from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ForecastResponseRecurringRulesByCategoryItem")


@_attrs_define
class ForecastResponseRecurringRulesByCategoryItem:
    """
    Attributes:
        category (str):
        expense_expected_monthly (float):
    """

    category: str
    expense_expected_monthly: float

    def to_dict(self) -> dict[str, Any]:
        category = self.category

        expense_expected_monthly = self.expense_expected_monthly

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "category": category,
                "expense_expected_monthly": expense_expected_monthly,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        category = d.pop("category")

        expense_expected_monthly = d.pop("expense_expected_monthly")

        forecast_response_recurring_rules_by_category_item = cls(
            category=category,
            expense_expected_monthly=expense_expected_monthly,
        )

        return forecast_response_recurring_rules_by_category_item
