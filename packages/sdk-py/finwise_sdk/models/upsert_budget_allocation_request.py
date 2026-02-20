from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.upsert_budget_allocation_request_metadata import (
        UpsertBudgetAllocationRequestMetadata,
    )


T = TypeVar("T", bound="UpsertBudgetAllocationRequest")


@_attrs_define
class UpsertBudgetAllocationRequest:
    """
    Attributes:
        category (str):
        amount (float):
        currency (Union[Unset, str]):
        metadata (Union[Unset, UpsertBudgetAllocationRequestMetadata]):
    """

    category: str
    amount: float
    currency: Union[Unset, str] = UNSET
    metadata: Union[Unset, "UpsertBudgetAllocationRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        category = self.category

        amount = self.amount

        currency = self.currency

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "category": category,
                "amount": amount,
            }
        )
        if currency is not UNSET:
            field_dict["currency"] = currency
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.upsert_budget_allocation_request_metadata import (
            UpsertBudgetAllocationRequestMetadata,
        )

        d = src_dict.copy()
        category = d.pop("category")

        amount = d.pop("amount")

        currency = d.pop("currency", UNSET)

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, UpsertBudgetAllocationRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = UpsertBudgetAllocationRequestMetadata.from_dict(_metadata)

        upsert_budget_allocation_request = cls(
            category=category,
            amount=amount,
            currency=currency,
            metadata=metadata,
        )

        return upsert_budget_allocation_request
