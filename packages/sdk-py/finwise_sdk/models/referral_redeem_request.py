from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ReferralRedeemRequest")


@_attrs_define
class ReferralRedeemRequest:
    """
    Attributes:
        code (str):
    """

    code: str

    def to_dict(self) -> dict[str, Any]:
        code = self.code

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "code": code,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        code = d.pop("code")

        referral_redeem_request = cls(
            code=code,
        )

        return referral_redeem_request
