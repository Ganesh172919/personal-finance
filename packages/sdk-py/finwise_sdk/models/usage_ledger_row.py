import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.usage_feature import UsageFeature

T = TypeVar("T", bound="UsageLedgerRow")


@_attrs_define
class UsageLedgerRow:
    """
    Attributes:
        feature (UsageFeature):
        units (int):
        tokens_in (int):
        tokens_out (int):
        cost_usd (float):
        updated_at (Union[None, datetime.datetime]):
    """

    feature: UsageFeature
    units: int
    tokens_in: int
    tokens_out: int
    cost_usd: float
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        feature = self.feature.value

        units = self.units

        tokens_in = self.tokens_in

        tokens_out = self.tokens_out

        cost_usd = self.cost_usd

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "feature": feature,
                "units": units,
                "tokens_in": tokens_in,
                "tokens_out": tokens_out,
                "cost_usd": cost_usd,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        feature = UsageFeature(d.pop("feature"))

        units = d.pop("units")

        tokens_in = d.pop("tokens_in")

        tokens_out = d.pop("tokens_out")

        cost_usd = d.pop("cost_usd")

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        usage_ledger_row = cls(
            feature=feature,
            units=units,
            tokens_in=tokens_in,
            tokens_out=tokens_out,
            cost_usd=cost_usd,
            updated_at=updated_at,
        )

        return usage_ledger_row
