from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.recurring_rule import RecurringRule


T = TypeVar("T", bound="ListRecurringRulesResponse")


@_attrs_define
class ListRecurringRulesResponse:
    """
    Attributes:
        org_id (str):
        rules (list['RecurringRule']):
        request_id (str):
    """

    org_id: str
    rules: list["RecurringRule"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        rules = []
        for rules_item_data in self.rules:
            rules_item = rules_item_data.to_dict()
            rules.append(rules_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "rules": rules,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.recurring_rule import RecurringRule

        d = src_dict.copy()
        org_id = d.pop("org_id")

        rules = []
        _rules = d.pop("rules")
        for rules_item_data in _rules:
            rules_item = RecurringRule.from_dict(rules_item_data)

            rules.append(rules_item)

        request_id = d.pop("request_id")

        list_recurring_rules_response = cls(
            org_id=org_id,
            rules=rules,
            request_id=request_id,
        )

        return list_recurring_rules_response
