import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.api_key_scope import ApiKeyScope

T = TypeVar("T", bound="ListApiKeysResponseApiKeysItem")


@_attrs_define
class ListApiKeysResponseApiKeysItem:
    """
    Attributes:
        id (str):
        name (str):
        prefix (str):
        scopes (list[ApiKeyScope]):
        created_at (datetime.datetime):
        last_used_at (Union[None, datetime.datetime]):
        revoked_at (Union[None, datetime.datetime]):
    """

    id: str
    name: str
    prefix: str
    scopes: list[ApiKeyScope]
    created_at: datetime.datetime
    last_used_at: Union[None, datetime.datetime]
    revoked_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        prefix = self.prefix

        scopes = []
        for scopes_item_data in self.scopes:
            scopes_item = scopes_item_data.value
            scopes.append(scopes_item)

        created_at = self.created_at.isoformat()

        last_used_at: Union[None, str]
        if isinstance(self.last_used_at, datetime.datetime):
            last_used_at = self.last_used_at.isoformat()
        else:
            last_used_at = self.last_used_at

        revoked_at: Union[None, str]
        if isinstance(self.revoked_at, datetime.datetime):
            revoked_at = self.revoked_at.isoformat()
        else:
            revoked_at = self.revoked_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "prefix": prefix,
                "scopes": scopes,
                "created_at": created_at,
                "last_used_at": last_used_at,
                "revoked_at": revoked_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        prefix = d.pop("prefix")

        scopes = []
        _scopes = d.pop("scopes")
        for scopes_item_data in _scopes:
            scopes_item = ApiKeyScope(scopes_item_data)

            scopes.append(scopes_item)

        created_at = isoparse(d.pop("created_at"))

        def _parse_last_used_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                last_used_at_type_1 = isoparse(data)

                return last_used_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        last_used_at = _parse_last_used_at(d.pop("last_used_at"))

        def _parse_revoked_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                revoked_at_type_1 = isoparse(data)

                return revoked_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        revoked_at = _parse_revoked_at(d.pop("revoked_at"))

        list_api_keys_response_api_keys_item = cls(
            id=id,
            name=name,
            prefix=prefix,
            scopes=scopes,
            created_at=created_at,
            last_used_at=last_used_at,
            revoked_at=revoked_at,
        )

        return list_api_keys_response_api_keys_item
