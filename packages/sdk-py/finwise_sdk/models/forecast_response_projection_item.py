from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ForecastResponseProjectionItem")


@_attrs_define
class ForecastResponseProjectionItem:
    """
    Attributes:
        period_key (str):
        income (float):
        expense (float):
        net (float):
    """

    period_key: str
    income: float
    expense: float
    net: float

    def to_dict(self) -> dict[str, Any]:
        period_key = self.period_key

        income = self.income

        expense = self.expense

        net = self.net

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "period_key": period_key,
                "income": income,
                "expense": expense,
                "net": net,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        period_key = d.pop("period_key")

        income = d.pop("income")

        expense = d.pop("expense")

        net = d.pop("net")

        forecast_response_projection_item = cls(
            period_key=period_key,
            income=income,
            expense=expense,
            net=net,
        )

        return forecast_response_projection_item
