from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="RegisterRequest")


@_attrs_define
class RegisterRequest:
    """
    Attributes:
        name (str):
        email (str):
        password (str):
        phone_number (Union[Unset, str]):
        referral_code (Union[Unset, str]):
    """

    name: str
    email: str
    password: str
    phone_number: Union[Unset, str] = UNSET
    referral_code: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        email = self.email

        password = self.password

        phone_number = self.phone_number

        referral_code = self.referral_code

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
                "email": email,
                "password": password,
            }
        )
        if phone_number is not UNSET:
            field_dict["phoneNumber"] = phone_number
        if referral_code is not UNSET:
            field_dict["referralCode"] = referral_code

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name")

        email = d.pop("email")

        password = d.pop("password")

        phone_number = d.pop("phoneNumber", UNSET)

        referral_code = d.pop("referralCode", UNSET)

        register_request = cls(
            name=name,
            email=email,
            password=password,
            phone_number=phone_number,
            referral_code=referral_code,
        )

        return register_request
