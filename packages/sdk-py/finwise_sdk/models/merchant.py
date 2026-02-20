import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.merchant_metadata import MerchantMetadata


T = TypeVar("T", bound="Merchant")


@_attrs_define
class Merchant:
    """
    Attributes:
        id (str):
        name (str):
        normalized_name (str):
        category_default (Union[None, str]):
        aliases (list[str]):
        metadata (MerchantMetadata):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    id: str
    name: str
    normalized_name: str
    category_default: Union[None, str]
    aliases: list[str]
    metadata: "MerchantMetadata"
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        normalized_name = self.normalized_name

        category_default: Union[None, str]
        category_default = self.category_default

        aliases = self.aliases

        metadata = self.metadata.to_dict()

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "normalized_name": normalized_name,
                "category_default": category_default,
                "aliases": aliases,
                "metadata": metadata,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.merchant_metadata import MerchantMetadata

        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        normalized_name = d.pop("normalized_name")

        def _parse_category_default(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        category_default = _parse_category_default(d.pop("category_default"))

        aliases = cast(list[str], d.pop("aliases"))

        metadata = MerchantMetadata.from_dict(d.pop("metadata"))

        def _parse_created_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_1 = isoparse(data)

                return created_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        created_at = _parse_created_at(d.pop("created_at"))

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        merchant = cls(
            id=id,
            name=name,
            normalized_name=normalized_name,
            category_default=category_default,
            aliases=aliases,
            metadata=metadata,
            created_at=created_at,
            updated_at=updated_at,
        )

        return merchant
