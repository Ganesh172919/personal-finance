from typing import TYPE_CHECKING, Any, TypeVar, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.referral_redeem_response_reward_units_by_feature import (
        ReferralRedeemResponseRewardUnitsByFeature,
    )


T = TypeVar("T", bound="ReferralRedeemResponseReward")


@_attrs_define
class ReferralRedeemResponseReward:
    """
    Attributes:
        periods (list[str]):
        units_by_feature (ReferralRedeemResponseRewardUnitsByFeature):
    """

    periods: list[str]
    units_by_feature: "ReferralRedeemResponseRewardUnitsByFeature"

    def to_dict(self) -> dict[str, Any]:
        periods = self.periods

        units_by_feature = self.units_by_feature.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "periods": periods,
                "unitsByFeature": units_by_feature,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.referral_redeem_response_reward_units_by_feature import (
            ReferralRedeemResponseRewardUnitsByFeature,
        )

        d = src_dict.copy()
        periods = cast(list[str], d.pop("periods"))

        units_by_feature = ReferralRedeemResponseRewardUnitsByFeature.from_dict(
            d.pop("unitsByFeature")
        )

        referral_redeem_response_reward = cls(
            periods=periods,
            units_by_feature=units_by_feature,
        )

        return referral_redeem_response_reward
