from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.referrals_me_response_referred_by_type_1 import (
        ReferralsMeResponseReferredByType1,
    )
    from ..models.referrals_me_response_reward import ReferralsMeResponseReward


T = TypeVar("T", bound="ReferralsMeResponse")


@_attrs_define
class ReferralsMeResponse:
    """
    Attributes:
        org_id (str):
        referral_code (str):
        share_url (str):
        redemptions_count (int):
        reward (ReferralsMeResponseReward):
        request_id (str):
        referred_by (Union['ReferralsMeResponseReferredByType1', None, Unset]):
    """

    org_id: str
    referral_code: str
    share_url: str
    redemptions_count: int
    reward: "ReferralsMeResponseReward"
    request_id: str
    referred_by: Union["ReferralsMeResponseReferredByType1", None, Unset] = UNSET

    def to_dict(self) -> dict[str, Any]:
        from ..models.referrals_me_response_referred_by_type_1 import (
            ReferralsMeResponseReferredByType1,
        )

        org_id = self.org_id

        referral_code = self.referral_code

        share_url = self.share_url

        redemptions_count = self.redemptions_count

        reward = self.reward.to_dict()

        request_id = self.request_id

        referred_by: Union[None, Unset, dict[str, Any]]
        if isinstance(self.referred_by, Unset):
            referred_by = UNSET
        elif isinstance(self.referred_by, ReferralsMeResponseReferredByType1):
            referred_by = self.referred_by.to_dict()
        else:
            referred_by = self.referred_by

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "referral_code": referral_code,
                "share_url": share_url,
                "redemptions_count": redemptions_count,
                "reward": reward,
                "request_id": request_id,
            }
        )
        if referred_by is not UNSET:
            field_dict["referred_by"] = referred_by

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.referrals_me_response_referred_by_type_1 import (
            ReferralsMeResponseReferredByType1,
        )
        from ..models.referrals_me_response_reward import ReferralsMeResponseReward

        d = src_dict.copy()
        org_id = d.pop("org_id")

        referral_code = d.pop("referral_code")

        share_url = d.pop("share_url")

        redemptions_count = d.pop("redemptions_count")

        reward = ReferralsMeResponseReward.from_dict(d.pop("reward"))

        request_id = d.pop("request_id")

        def _parse_referred_by(
            data: object,
        ) -> Union["ReferralsMeResponseReferredByType1", None, Unset]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                referred_by_type_1 = ReferralsMeResponseReferredByType1.from_dict(data)

                return referred_by_type_1
            except:  # noqa: E722
                pass
            return cast(Union["ReferralsMeResponseReferredByType1", None, Unset], data)

        referred_by = _parse_referred_by(d.pop("referred_by", UNSET))

        referrals_me_response = cls(
            org_id=org_id,
            referral_code=referral_code,
            share_url=share_url,
            redemptions_count=redemptions_count,
            reward=reward,
            request_id=request_id,
            referred_by=referred_by,
        )

        return referrals_me_response
