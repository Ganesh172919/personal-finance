from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="VerifyEmailRequest")


@_attrs_define
class VerifyEmailRequest:
    """
    Attributes:
        email (str):
        otp (str):
    """

    email: str
    otp: str

    def to_dict(self) -> dict[str, Any]:
        email = self.email

        otp = self.otp

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "email": email,
                "otp": otp,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email")

        otp = d.pop("otp")

        verify_email_request = cls(
            email=email,
            otp=otp,
        )

        return verify_email_request
