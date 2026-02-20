from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.account_status import AccountStatus
from ..models.account_type import AccountType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.update_account_request_metadata import UpdateAccountRequestMetadata


T = TypeVar("T", bound="UpdateAccountRequest")


@_attrs_define
class UpdateAccountRequest:
    """
    Attributes:
        name (Union[Unset, str]):
        institution (Union[Unset, str]):
        type_ (Union[Unset, AccountType]):
        currency (Union[Unset, str]):
        mask (Union[Unset, str]):
        status (Union[Unset, AccountStatus]):
        metadata (Union[Unset, UpdateAccountRequestMetadata]):
    """

    name: Union[Unset, str] = UNSET
    institution: Union[Unset, str] = UNSET
    type_: Union[Unset, AccountType] = UNSET
    currency: Union[Unset, str] = UNSET
    mask: Union[Unset, str] = UNSET
    status: Union[Unset, AccountStatus] = UNSET
    metadata: Union[Unset, "UpdateAccountRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        institution = self.institution

        type_: Union[Unset, str] = UNSET
        if not isinstance(self.type_, Unset):
            type_ = self.type_.value

        currency = self.currency

        mask = self.mask

        status: Union[Unset, str] = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if institution is not UNSET:
            field_dict["institution"] = institution
        if type_ is not UNSET:
            field_dict["type"] = type_
        if currency is not UNSET:
            field_dict["currency"] = currency
        if mask is not UNSET:
            field_dict["mask"] = mask
        if status is not UNSET:
            field_dict["status"] = status
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.update_account_request_metadata import (
            UpdateAccountRequestMetadata,
        )

        d = src_dict.copy()
        name = d.pop("name", UNSET)

        institution = d.pop("institution", UNSET)

        _type_ = d.pop("type", UNSET)
        type_: Union[Unset, AccountType]
        if isinstance(_type_, Unset):
            type_ = UNSET
        else:
            type_ = AccountType(_type_)

        currency = d.pop("currency", UNSET)

        mask = d.pop("mask", UNSET)

        _status = d.pop("status", UNSET)
        status: Union[Unset, AccountStatus]
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = AccountStatus(_status)

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, UpdateAccountRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = UpdateAccountRequestMetadata.from_dict(_metadata)

        update_account_request = cls(
            name=name,
            institution=institution,
            type_=type_,
            currency=currency,
            mask=mask,
            status=status,
            metadata=metadata,
        )

        return update_account_request
