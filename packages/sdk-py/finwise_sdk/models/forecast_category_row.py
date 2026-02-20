from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ForecastCategoryRow")


@_attrs_define
class ForecastCategoryRow:
    """
    Attributes:
        category (str):
        expense_monthly_avg (float):
    """

    category: str
    expense_monthly_avg: float

    def to_dict(self) -> dict[str, Any]:
        category = self.category

        expense_monthly_avg = self.expense_monthly_avg

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "category": category,
                "expense_monthly_avg": expense_monthly_avg,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        category = d.pop("category")

        expense_monthly_avg = d.pop("expense_monthly_avg")

        forecast_category_row = cls(
            category=category,
            expense_monthly_avg=expense_monthly_avg,
        )

        return forecast_category_row
