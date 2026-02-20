import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.budget_allocation_metadata import BudgetAllocationMetadata


T = TypeVar("T", bound="BudgetAllocation")


@_attrs_define
class BudgetAllocation:
    """
    Attributes:
        id (str):
        period_key (str):
        category (str):
        amount (float):
        currency (str):
        metadata (BudgetAllocationMetadata):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    id: str
    period_key: str
    category: str
    amount: float
    currency: str
    metadata: "BudgetAllocationMetadata"
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        period_key = self.period_key

        category = self.category

        amount = self.amount

        currency = self.currency

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
                "period_key": period_key,
                "category": category,
                "amount": amount,
                "currency": currency,
                "metadata": metadata,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.budget_allocation_metadata import BudgetAllocationMetadata

        d = src_dict.copy()
        id = d.pop("id")

        period_key = d.pop("period_key")

        category = d.pop("category")

        amount = d.pop("amount")

        currency = d.pop("currency")

        metadata = BudgetAllocationMetadata.from_dict(d.pop("metadata"))

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

        budget_allocation = cls(
            id=id,
            period_key=period_key,
            category=category,
            amount=amount,
            currency=currency,
            metadata=metadata,
            created_at=created_at,
            updated_at=updated_at,
        )

        return budget_allocation
