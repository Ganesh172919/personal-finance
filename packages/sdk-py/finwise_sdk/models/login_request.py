from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="LoginRequest")


@_attrs_define
class LoginRequest:
    """
    Attributes:
        email (str):
        password (str):
    """

    email: str
    password: str

    def to_dict(self) -> dict[str, Any]:
        email = self.email

        password = self.password

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "email": email,
                "password": password,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email")

        password = d.pop("password")

        login_request = cls(
            email=email,
            password=password,
        )

        return login_request
