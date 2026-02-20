from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AnalyticsOverviewResponseUsageAdditionalProperty")


@_attrs_define
class AnalyticsOverviewResponseUsageAdditionalProperty:
    """
    Attributes:
        units (int):
        tokens_in (int):
        tokens_out (int):
        cost_usd (float):
    """

    units: int
    tokens_in: int
    tokens_out: int
    cost_usd: float

    def to_dict(self) -> dict[str, Any]:
        units = self.units

        tokens_in = self.tokens_in

        tokens_out = self.tokens_out

        cost_usd = self.cost_usd

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "units": units,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost_usd,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        units = d.pop("units")

        tokens_in = d.pop("tokens_in")

        tokens_out = d.pop("tokens_out")

        cost_usd = d.pop("cost_usd")

        analytics_overview_response_usage_additional_property = cls(
            units=units,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost_usd,
        )

        return analytics_overview_response_usage_additional_property
