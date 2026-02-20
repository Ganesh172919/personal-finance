from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="RegisterResponse")


@_attrs_define
class RegisterResponse:
    """
    Attributes:
        message (str):
        request_id (str):
        dev_otp (Union[Unset, str]):
    """

    message: str
    request_id: str
    dev_otp: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        message = self.message

        request_id = self.request_id

        dev_otp = self.dev_otp

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "message": message,
                "request_id": request_id,
            }
        )
        if dev_otp is not UNSET:
            field_dict["dev_otp"] = dev_otp

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        message = d.pop("message")

        request_id = d.pop("request_id")

        dev_otp = d.pop("dev_otp", UNSET)

        register_response = cls(
            message=message,
            request_id=request_id,
            dev_otp=dev_otp,
        )

        return register_response
