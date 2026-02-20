from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.create_api_key_response_key import CreateApiKeyResponseKey


T = TypeVar("T", bound="CreateApiKeyResponse")


@_attrs_define
class CreateApiKeyResponse:
    """
    Attributes:
        api_key (str): Secret API key value (only returned once).
        key (CreateApiKeyResponseKey):
        request_id (str):
    """

    api_key: str
    key: "CreateApiKeyResponseKey"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        api_key = self.api_key

        key = self.key.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "api_key": api_key,
                "key": key,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_api_key_response_key import CreateApiKeyResponseKey

        d = src_dict.copy()
        api_key = d.pop("api_key")

        key = CreateApiKeyResponseKey.from_dict(d.pop("key"))

        request_id = d.pop("request_id")

        create_api_key_response = cls(
            api_key=api_key,
            key=key,
            request_id=request_id,
        )

        return create_api_key_response
