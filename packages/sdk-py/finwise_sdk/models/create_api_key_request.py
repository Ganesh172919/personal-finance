from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.api_key_scope import ApiKeyScope

T = TypeVar("T", bound="CreateApiKeyRequest")


@_attrs_define
class CreateApiKeyRequest:
    """
    Attributes:
        name (str):
        scopes (list[ApiKeyScope]):
    """

    name: str
    scopes: list[ApiKeyScope]

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        scopes = []
        for scopes_item_data in self.scopes:
            scopes_item = scopes_item_data.value
            scopes.append(scopes_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
                "scopes": scopes,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name")

        scopes = []
        _scopes = d.pop("scopes")
        for scopes_item_data in _scopes:
            scopes_item = ApiKeyScope(scopes_item_data)

            scopes.append(scopes_item)

        create_api_key_request = cls(
            name=name,
            scopes=scopes,
        )

        return create_api_key_request
