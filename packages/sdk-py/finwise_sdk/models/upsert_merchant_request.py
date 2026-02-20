from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.upsert_merchant_request_metadata import UpsertMerchantRequestMetadata


T = TypeVar("T", bound="UpsertMerchantRequest")


@_attrs_define
class UpsertMerchantRequest:
    """
    Attributes:
        name (str):
        category_default (Union[Unset, str]):
        aliases (Union[Unset, list[str]]):
        metadata (Union[Unset, UpsertMerchantRequestMetadata]):
    """

    name: str
    category_default: Union[Unset, str] = UNSET
    aliases: Union[Unset, list[str]] = UNSET
    metadata: Union[Unset, "UpsertMerchantRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        category_default = self.category_default

        aliases: Union[Unset, list[str]] = UNSET
        if not isinstance(self.aliases, Unset):
            aliases = self.aliases

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
            }
        )
        if category_default is not UNSET:
            field_dict["category_default"] = category_default
        if aliases is not UNSET:
            field_dict["aliases"] = aliases
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.upsert_merchant_request_metadata import (
            UpsertMerchantRequestMetadata,
        )

        d = src_dict.copy()
        name = d.pop("name")

        category_default = d.pop("category_default", UNSET)

        aliases = cast(list[str], d.pop("aliases", UNSET))

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, UpsertMerchantRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = UpsertMerchantRequestMetadata.from_dict(_metadata)

        upsert_merchant_request = cls(
            name=name,
            category_default=category_default,
            aliases=aliases,
            metadata=metadata,
        )

        return upsert_merchant_request
