import datetime
from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..types import UNSET, Unset

T = TypeVar("T", bound="ReferralsMeResponseReferredByType1")


@_attrs_define
class ReferralsMeResponseReferredByType1:
    """
    Attributes:
        referral_code (str):
        redeemed_at (Union[Unset, datetime.datetime]):
    """

    referral_code: str
    redeemed_at: Union[Unset, datetime.datetime] = UNSET

    def to_dict(self) -> dict[str, Any]:
        referral_code = self.referral_code

        redeemed_at: Union[Unset, str] = UNSET
        if not isinstance(self.redeemed_at, Unset):
            redeemed_at = self.redeemed_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "referral_code": referral_code,
            }
        )
        if redeemed_at is not UNSET:
            field_dict["redeemed_at"] = redeemed_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        referral_code = d.pop("referral_code")

        _redeemed_at = d.pop("redeemed_at", UNSET)
        redeemed_at: Union[Unset, datetime.datetime]
        if isinstance(_redeemed_at, Unset):
            redeemed_at = UNSET
        else:
            redeemed_at = isoparse(_redeemed_at)

        referrals_me_response_referred_by_type_1 = cls(
            referral_code=referral_code,
            redeemed_at=redeemed_at,
        )

        return referrals_me_response_referred_by_type_1
