from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ForecastResponseBaseline")


@_attrs_define
class ForecastResponseBaseline:
    """
    Attributes:
        days_covered (int):
        income_monthly_avg (float):
        expense_monthly_avg (float):
        net_monthly_avg (float):
    """

    days_covered: int
    income_monthly_avg: float
    expense_monthly_avg: float
    net_monthly_avg: float

    def to_dict(self) -> dict[str, Any]:
        days_covered = self.days_covered

        income_monthly_avg = self.income_monthly_avg

        expense_monthly_avg = self.expense_monthly_avg

        net_monthly_avg = self.net_monthly_avg

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "days_covered": days_covered,
                "income_monthly_avg": income_monthly_avg,
                "expense_monthly_avg": expense_monthly_avg,
                "net_monthly_avg": net_monthly_avg,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        days_covered = d.pop("days_covered")

        income_monthly_avg = d.pop("income_monthly_avg")

        expense_monthly_avg = d.pop("expense_monthly_avg")

        net_monthly_avg = d.pop("net_monthly_avg")

        forecast_response_baseline = cls(
            days_covered=days_covered,
            income_monthly_avg=income_monthly_avg,
            expense_monthly_avg=expense_monthly_avg,
            net_monthly_avg=net_monthly_avg,
        )

        return forecast_response_baseline
