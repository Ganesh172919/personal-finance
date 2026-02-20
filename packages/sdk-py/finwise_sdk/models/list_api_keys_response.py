from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.list_api_keys_response_api_keys_item import (
        ListApiKeysResponseApiKeysItem,
    )


T = TypeVar("T", bound="ListApiKeysResponse")


@_attrs_define
class ListApiKeysResponse:
    """
    Attributes:
        api_keys (list['ListApiKeysResponseApiKeysItem']):
        request_id (str):
    """

    api_keys: list["ListApiKeysResponseApiKeysItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        api_keys = []
        for api_keys_item_data in self.api_keys:
            api_keys_item = api_keys_item_data.to_dict()
            api_keys.append(api_keys_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "api_keys": api_keys,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.list_api_keys_response_api_keys_item import (
            ListApiKeysResponseApiKeysItem,
        )

        d = src_dict.copy()
        api_keys = []
        _api_keys = d.pop("api_keys")
        for api_keys_item_data in _api_keys:
            api_keys_item = ListApiKeysResponseApiKeysItem.from_dict(api_keys_item_data)

            api_keys.append(api_keys_item)

        request_id = d.pop("request_id")

        list_api_keys_response = cls(
            api_keys=api_keys,
            request_id=request_id,
        )

        return list_api_keys_response
