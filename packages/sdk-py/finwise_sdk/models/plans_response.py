from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.plan_catalog_entry import PlanCatalogEntry


T = TypeVar("T", bound="PlansResponse")


@_attrs_define
class PlansResponse:
    """
    Attributes:
        plans (list['PlanCatalogEntry']):
        request_id (str):
    """

    plans: list["PlanCatalogEntry"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        plans = []
        for plans_item_data in self.plans:
            plans_item = plans_item_data.to_dict()
            plans.append(plans_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plans": plans,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.plan_catalog_entry import PlanCatalogEntry

        d = src_dict.copy()
        plans = []
        _plans = d.pop("plans")
        for plans_item_data in _plans:
            plans_item = PlanCatalogEntry.from_dict(plans_item_data)

            plans.append(plans_item)

        request_id = d.pop("request_id")

        plans_response = cls(
            plans=plans,
            request_id=request_id,
        )

        return plans_response
