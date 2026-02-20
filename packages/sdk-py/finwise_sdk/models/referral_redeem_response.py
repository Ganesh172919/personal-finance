from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.referral_redeem_response_reward import ReferralRedeemResponseReward


T = TypeVar("T", bound="ReferralRedeemResponse")


@_attrs_define
class ReferralRedeemResponse:
    """
    Attributes:
        org_id (str):
        applied (bool):
        reason (str):
        redemption_id (str):
        referrer_org_id (str):
        reward (ReferralRedeemResponseReward):
        request_id (str):
    """

    org_id: str
    applied: bool
    reason: str
    redemption_id: str
    referrer_org_id: str
    reward: "ReferralRedeemResponseReward"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        applied = self.applied

        reason = self.reason

        redemption_id = self.redemption_id

        referrer_org_id = self.referrer_org_id

        reward = self.reward.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "applied": applied,
                "reason": reason,
                "redemption_id": redemption_id,
                "referrer_org_id": referrer_org_id,
                "reward": reward,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.referral_redeem_response_reward import (
            ReferralRedeemResponseReward,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        applied = d.pop("applied")

        reason = d.pop("reason")

        redemption_id = d.pop("redemption_id")

        referrer_org_id = d.pop("referrer_org_id")

        reward = ReferralRedeemResponseReward.from_dict(d.pop("reward"))

        request_id = d.pop("request_id")

        referral_redeem_response = cls(
            org_id=org_id,
            applied=applied,
            reason=reason,
            redemption_id=redemption_id,
            referrer_org_id=referrer_org_id,
            reward=reward,
            request_id=request_id,
        )

        return referral_redeem_response
