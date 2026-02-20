from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.plan_limit import PlanLimit


T = TypeVar("T", bound="PlanCatalogEntry")


@_attrs_define
class PlanCatalogEntry:
    """
    Attributes:
        id (str):
        label (str):
        limits (PlanLimit):
    """

    id: str
    label: str
    limits: "PlanLimit"

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        label = self.label

        limits = self.limits.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "label": label,
                "limits": limits,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.plan_limit import PlanLimit

        d = src_dict.copy()
        id = d.pop("id")

        label = d.pop("label")

        limits = PlanLimit.from_dict(d.pop("limits"))

        plan_catalog_entry = cls(
            id=id,
            label=label,
            limits=limits,
        )

        return plan_catalog_entry
