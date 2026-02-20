from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.referrals_me_response_reward_units import (
        ReferralsMeResponseRewardUnits,
    )


T = TypeVar("T", bound="ReferralsMeResponseReward")


@_attrs_define
class ReferralsMeResponseReward:
    """
    Attributes:
        months (int):
        units (ReferralsMeResponseRewardUnits):
    """

    months: int
    units: "ReferralsMeResponseRewardUnits"

    def to_dict(self) -> dict[str, Any]:
        months = self.months

        units = self.units.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "months": months,
                "units": units,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.referrals_me_response_reward_units import (
            ReferralsMeResponseRewardUnits,
        )

        d = src_dict.copy()
        months = d.pop("months")

        units = ReferralsMeResponseRewardUnits.from_dict(d.pop("units"))

        referrals_me_response_reward = cls(
            months=months,
            units=units,
        )

        return referrals_me_response_reward
