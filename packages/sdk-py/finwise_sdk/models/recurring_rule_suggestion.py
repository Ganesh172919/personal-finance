from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.recurring_rule_suggestion_status import RecurringRuleSuggestionStatus
from ..types import UNSET, Unset

T = TypeVar("T", bound="RecurringRuleSuggestion")


@_attrs_define
class RecurringRuleSuggestion:
    """
    Attributes:
        name (str):
        cron (str):
        status (RecurringRuleSuggestionStatus):
        merchant_id (Union[Unset, str]):
        merchant_name (Union[Unset, str]):
        category (Union[Unset, str]):
        amount_min (Union[Unset, float]):
        amount_max (Union[Unset, float]):
    """

    name: str
    cron: str
    status: RecurringRuleSuggestionStatus
    merchant_id: Union[Unset, str] = UNSET
    merchant_name: Union[Unset, str] = UNSET
    category: Union[Unset, str] = UNSET
    amount_min: Union[Unset, float] = UNSET
    amount_max: Union[Unset, float] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        cron = self.cron

        status = self.status.value

        merchant_id = self.merchant_id

        merchant_name = self.merchant_name

        category = self.category

        amount_min = self.amount_min

        amount_max = self.amount_max

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
                "cron": cron,
                "status": status,
            }
        )
        if merchant_id is not UNSET:
            field_dict["merchant_id"] = merchant_id
        if merchant_name is not UNSET:
            field_dict["merchant_name"] = merchant_name
        if category is not UNSET:
            field_dict["category"] = category
        if amount_min is not UNSET:
            field_dict["amount_min"] = amount_min
        if amount_max is not UNSET:
            field_dict["amount_max"] = amount_max

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name")

        cron = d.pop("cron")

        status = RecurringRuleSuggestionStatus(d.pop("status"))

        merchant_id = d.pop("merchant_id", UNSET)

        merchant_name = d.pop("merchant_name", UNSET)

        category = d.pop("category", UNSET)

        amount_min = d.pop("amount_min", UNSET)

        amount_max = d.pop("amount_max", UNSET)

        recurring_rule_suggestion = cls(
            name=name,
            cron=cron,
            status=status,
            merchant_id=merchant_id,
            merchant_name=merchant_name,
            category=category,
            amount_min=amount_min,
            amount_max=amount_max,
        )

        return recurring_rule_suggestion
