from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="BudgetEnvelopeRow")


@_attrs_define
class BudgetEnvelopeRow:
    """
    Attributes:
        category (str):
        planned (float):
        spent (float):
        remaining (float):
        currency (str):
        tx_count (int):
        unbudgeted (bool):
    """

    category: str
    planned: float
    spent: float
    remaining: float
    currency: str
    tx_count: int
    unbudgeted: bool

    def to_dict(self) -> dict[str, Any]:
        category = self.category

        planned = self.planned

        spent = self.spent

        remaining = self.remaining

        currency = self.currency

        tx_count = self.tx_count

        unbudgeted = self.unbudgeted

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "category": category,
                "planned": planned,
                "spent": spent,
                "remaining": remaining,
                "currency": currency,
                "tx_count": tx_count,
                "unbudgeted": unbudgeted,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        category = d.pop("category")

        planned = d.pop("planned")

        spent = d.pop("spent")

        remaining = d.pop("remaining")

        currency = d.pop("currency")

        tx_count = d.pop("tx_count")

        unbudgeted = d.pop("unbudgeted")

        budget_envelope_row = cls(
            category=category,
            planned=planned,
            spent=spent,
            remaining=remaining,
            currency=currency,
            tx_count=tx_count,
            unbudgeted=unbudgeted,
        )

        return budget_envelope_row
