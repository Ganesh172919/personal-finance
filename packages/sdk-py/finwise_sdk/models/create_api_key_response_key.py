import datetime
from typing import Any, TypeVar

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.api_key_scope import ApiKeyScope

T = TypeVar("T", bound="CreateApiKeyResponseKey")


@_attrs_define
class CreateApiKeyResponseKey:
    """
    Attributes:
        id (str):
        prefix (str):
        name (str):
        scopes (list[ApiKeyScope]):
        created_at (datetime.datetime):
    """

    id: str
    prefix: str
    name: str
    scopes: list[ApiKeyScope]
    created_at: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        prefix = self.prefix

        name = self.name

        scopes = []
        for scopes_item_data in self.scopes:
            scopes_item = scopes_item_data.value
            scopes.append(scopes_item)

        created_at = self.created_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "prefix": prefix,
                "name": name,
                "scopes": scopes,
                "created_at": created_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        prefix = d.pop("prefix")

        name = d.pop("name")

        scopes = []
        _scopes = d.pop("scopes")
        for scopes_item_data in _scopes:
            scopes_item = ApiKeyScope(scopes_item_data)

            scopes.append(scopes_item)

        created_at = isoparse(d.pop("created_at"))

        create_api_key_response_key = cls(
            id=id,
            prefix=prefix,
            name=name,
            scopes=scopes,
            created_at=created_at,
        )

        return create_api_key_response_key
