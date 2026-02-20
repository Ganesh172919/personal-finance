from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="BudgetEnvelopesTotals")


@_attrs_define
class BudgetEnvelopesTotals:
    """
    Attributes:
        planned (float):
        spent (float):
        remaining (float):
        unbudgeted_spent (float):
    """

    planned: float
    spent: float
    remaining: float
    unbudgeted_spent: float

    def to_dict(self) -> dict[str, Any]:
        planned = self.planned

        spent = self.spent

        remaining = self.remaining

        unbudgeted_spent = self.unbudgeted_spent

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "planned": planned,
                "spent": spent,
                "remaining": remaining,
                "unbudgeted_spent": unbudgeted_spent,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        planned = d.pop("planned")

        spent = d.pop("spent")

        remaining = d.pop("remaining")

        unbudgeted_spent = d.pop("unbudgeted_spent")

        budget_envelopes_totals = cls(
            planned=planned,
            spent=spent,
            remaining=remaining,
            unbudgeted_spent=unbudgeted_spent,
        )

        return budget_envelopes_totals
