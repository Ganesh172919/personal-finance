from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AuthProvidersResponse")


@_attrs_define
class AuthProvidersResponse:
    """
    Attributes:
        email (bool):
        google (bool):
        request_id (str):
    """

    email: bool
    google: bool
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        email = self.email

        google = self.google

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "email": email,
                "google": google,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        email = d.pop("email")

        google = d.pop("google")

        request_id = d.pop("request_id")

        auth_providers_response = cls(
            email=email,
            google=google,
            request_id=request_id,
        )

        return auth_providers_response
