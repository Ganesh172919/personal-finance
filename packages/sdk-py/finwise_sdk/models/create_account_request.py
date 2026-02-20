from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.account_type import AccountType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.create_account_request_metadata import CreateAccountRequestMetadata


T = TypeVar("T", bound="CreateAccountRequest")


@_attrs_define
class CreateAccountRequest:
    """
    Attributes:
        name (str):
        institution (Union[Unset, str]):
        type_ (Union[Unset, AccountType]):
        currency (Union[Unset, str]):
        mask (Union[Unset, str]):
        metadata (Union[Unset, CreateAccountRequestMetadata]):
    """

    name: str
    institution: Union[Unset, str] = UNSET
    type_: Union[Unset, AccountType] = UNSET
    currency: Union[Unset, str] = UNSET
    mask: Union[Unset, str] = UNSET
    metadata: Union[Unset, "CreateAccountRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        institution = self.institution

        type_: Union[Unset, str] = UNSET
        if not isinstance(self.type_, Unset):
            type_ = self.type_.value

        currency = self.currency

        mask = self.mask

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
            }
        )
        if institution is not UNSET:
            field_dict["institution"] = institution
        if type_ is not UNSET:
            field_dict["type"] = type_
        if currency is not UNSET:
            field_dict["currency"] = currency
        if mask is not UNSET:
            field_dict["mask"] = mask
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_account_request_metadata import (
            CreateAccountRequestMetadata,
        )

        d = src_dict.copy()
        name = d.pop("name")

        institution = d.pop("institution", UNSET)

        _type_ = d.pop("type", UNSET)
        type_: Union[Unset, AccountType]
        if isinstance(_type_, Unset):
            type_ = UNSET
        else:
            type_ = AccountType(_type_)

        currency = d.pop("currency", UNSET)

        mask = d.pop("mask", UNSET)

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, CreateAccountRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = CreateAccountRequestMetadata.from_dict(_metadata)

        create_account_request = cls(
            name=name,
            institution=institution,
            type_=type_,
            currency=currency,
            mask=mask,
            metadata=metadata,
        )

        return create_account_request
