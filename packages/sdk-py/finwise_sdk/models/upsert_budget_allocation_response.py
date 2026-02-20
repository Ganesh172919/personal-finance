from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.budget_allocation import BudgetAllocation


T = TypeVar("T", bound="UpsertBudgetAllocationResponse")


@_attrs_define
class UpsertBudgetAllocationResponse:
    """
    Attributes:
        org_id (str):
        period_key (str):
        allocation (BudgetAllocation):
        request_id (str):
    """

    org_id: str
    period_key: str
    allocation: "BudgetAllocation"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        period_key = self.period_key

        allocation = self.allocation.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "period_key": period_key,
                "allocation": allocation,
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

        allocation = BudgetAllocation.from_dict(d.pop("allocation"))

        request_id = d.pop("request_id")

        upsert_budget_allocation_response = cls(
            org_id=org_id,
            period_key=period_key,
            allocation=allocation,
            request_id=request_id,
        )

        return upsert_budget_allocation_response
