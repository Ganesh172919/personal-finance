from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="LogoutResponse")


@_attrs_define
class LogoutResponse:
    """
    Attributes:
        message (str):
        request_id (str):
    """

    message: str
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        message = self.message

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "message": message,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        message = d.pop("message")

        request_id = d.pop("request_id")

        logout_response = cls(
            message=message,
            request_id=request_id,
        )

        return logout_response
