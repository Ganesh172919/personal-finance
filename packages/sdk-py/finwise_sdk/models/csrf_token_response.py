from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="CsrfTokenResponse")


@_attrs_define
class CsrfTokenResponse:
    """
    Attributes:
        csrf_token (str):
        request_id (str):
    """

    csrf_token: str
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        csrf_token = self.csrf_token

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "csrf_token": csrf_token,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        csrf_token = d.pop("csrf_token")

        request_id = d.pop("request_id")

        csrf_token_response = cls(
            csrf_token=csrf_token,
            request_id=request_id,
        )

        return csrf_token_response
