from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="ResendVerificationRequest")


@_attrs_define
class ResendVerificationRequest:
    """
    Attributes:
        email (str):
    """

    email: str

    def to_dict(self) -> dict[str, Any]:
        email = self.email

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "email": email,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email")

        resend_verification_request = cls(
            email=email,
        )

        return resend_verification_request
