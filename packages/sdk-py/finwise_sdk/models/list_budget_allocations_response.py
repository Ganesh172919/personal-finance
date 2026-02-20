from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.budget_allocation import BudgetAllocation


T = TypeVar("T", bound="ListBudgetAllocationsResponse")


@_attrs_define
class ListBudgetAllocationsResponse:
    """
    Attributes:
        org_id (str):
        period_key (str):
        allocations (list['BudgetAllocation']):
        request_id (str):
    """

    org_id: str
    period_key: str
    allocations: list["BudgetAllocation"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        period_key = self.period_key

        allocations = []
        for allocations_item_data in self.allocations:
            allocations_item = allocations_item_data.to_dict()
            allocations.append(allocations_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "period_key": period_key,
                "allocations": allocations,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.budget_allocation import BudgetAllocation

        d = src_dict.copy()
        org_id = d.pop("org_id")

        period_key = d.pop("period_key")

        allocations = []
        _allocations = d.pop("allocations")
        for allocations_item_data in _allocations:
            allocations_item = BudgetAllocation.from_dict(allocations_item_data)

            allocations.append(allocations_item)

        request_id = d.pop("request_id")

        list_budget_allocations_response = cls(
            org_id=org_id,
            period_key=period_key,
            allocations=allocations,
            request_id=request_id,
        )

        return list_budget_allocations_response
