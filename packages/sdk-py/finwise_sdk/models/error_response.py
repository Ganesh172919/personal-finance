from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.error_response_details_type_0 import ErrorResponseDetailsType0


T = TypeVar("T", bound="ErrorResponse")


@_attrs_define
class ErrorResponse:
    """
    Attributes:
        message (str):
        code (str):
        request_id (str):
        details (Union['ErrorResponseDetailsType0', None, Unset, bool, float, list[Any], str]): Optional error details
            (shape is endpoint-specific).
    """

    message: str
    code: str
    request_id: str
    details: Union[
        "ErrorResponseDetailsType0", None, Unset, bool, float, list[Any], str
    ] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        from ..models.error_response_details_type_0 import ErrorResponseDetailsType0

        message = self.message

        code = self.code

        request_id = self.request_id

        details: Union[None, Unset, bool, dict[str, Any], float, list[Any], str]
        if isinstance(self.details, Unset):
            details = UNSET
        elif isinstance(self.details, ErrorResponseDetailsType0):
            details = self.details.to_dict()
        elif isinstance(self.details, list):
            details = self.details

        else:
            details = self.details

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "message": message,
                "code": code,
                "request_id": request_id,
            }
        )
        if details is not UNSET:
            field_dict["details"] = details

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.error_response_details_type_0 import ErrorResponseDetailsType0

        d = src_dict.copy()
        message = d.pop("message")

        code = d.pop("code")

        request_id = d.pop("request_id")

        def _parse_details(
            data: object,
        ) -> Union[
            "ErrorResponseDetailsType0", None, Unset, bool, float, list[Any], str
        ]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                details_type_0 = ErrorResponseDetailsType0.from_dict(data)

                return details_type_0
            except:  # noqa: E722
                pass
            try:
                if not isinstance(data, list):
                    raise TypeError()
                details_type_1 = cast(list[Any], data)

                return details_type_1
            except:  # noqa: E722
                pass
            return cast(
                Union[
                    "ErrorResponseDetailsType0",
                    None,
                    Unset,
                    bool,
                    float,
                    list[Any],
                    str,
                ],
                data,
            )

        details = _parse_details(d.pop("details", UNSET))

        error_response = cls(
            message=message,
            code=code,
            request_id=request_id,
            details=details,
        )

        error_response.additional_properties = d
        return error_response

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
