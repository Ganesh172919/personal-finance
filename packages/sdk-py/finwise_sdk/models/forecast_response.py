from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.forecast_category_row import ForecastCategoryRow
    from ..models.forecast_response_baseline import ForecastResponseBaseline
    from ..models.forecast_response_projection_item import (
        ForecastResponseProjectionItem,
    )
    from ..models.forecast_response_recurring_rules import (
        ForecastResponseRecurringRules,
    )


T = TypeVar("T", bound="ForecastResponse")


@_attrs_define
class ForecastResponse:
    """
    Attributes:
        org_id (str):
        currency (str):
        period_key (str):
        months (int):
        baseline (ForecastResponseBaseline):
        recurring_rules (ForecastResponseRecurringRules):
        top_categories (list['ForecastCategoryRow']):
        projection (list['ForecastResponseProjectionItem']):
        request_id (str):
    """

    org_id: str
    currency: str
    period_key: str
    months: int
    baseline: "ForecastResponseBaseline"
    recurring_rules: "ForecastResponseRecurringRules"
    top_categories: list["ForecastCategoryRow"]
    projection: list["ForecastResponseProjectionItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        currency = self.currency

        period_key = self.period_key

        months = self.months

        baseline = self.baseline.to_dict()

        recurring_rules = self.recurring_rules.to_dict()

        top_categories = []
        for top_categories_item_data in self.top_categories:
            top_categories_item = top_categories_item_data.to_dict()
            top_categories.append(top_categories_item)

        projection = []
        for projection_item_data in self.projection:
            projection_item = projection_item_data.to_dict()
            projection.append(projection_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "currency": currency,
                "period_key": period_key,
                "months": months,
                "baseline": baseline,
                "recurring_rules": recurring_rules,
                "top_categories": top_categories,
                "projection": projection,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.forecast_category_row import ForecastCategoryRow
        from ..models.forecast_response_baseline import ForecastResponseBaseline
        from ..models.forecast_response_projection_item import (
            ForecastResponseProjectionItem,
        )
        from ..models.forecast_response_recurring_rules import (
            ForecastResponseRecurringRules,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        currency = d.pop("currency")

        period_key = d.pop("period_key")

        months = d.pop("months")

        baseline = ForecastResponseBaseline.from_dict(d.pop("baseline"))

        recurring_rules = ForecastResponseRecurringRules.from_dict(
            d.pop("recurring_rules")
        )

        top_categories = []
        _top_categories = d.pop("top_categories")
        for top_categories_item_data in _top_categories:
            top_categories_item = ForecastCategoryRow.from_dict(
                top_categories_item_data
            )

            top_categories.append(top_categories_item)

        projection = []
        _projection = d.pop("projection")
        for projection_item_data in _projection:
            projection_item = ForecastResponseProjectionItem.from_dict(
                projection_item_data
            )

            projection.append(projection_item)

        request_id = d.pop("request_id")

        forecast_response = cls(
            org_id=org_id,
            currency=currency,
            period_key=period_key,
            months=months,
            baseline=baseline,
            recurring_rules=recurring_rules,
            top_categories=top_categories,
            projection=projection,
            request_id=request_id,
        )

        return forecast_response
