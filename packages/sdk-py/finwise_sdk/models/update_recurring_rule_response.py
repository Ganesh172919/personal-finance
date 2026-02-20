from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.recurring_rule import RecurringRule


T = TypeVar("T", bound="UpdateRecurringRuleResponse")


@_attrs_define
class UpdateRecurringRuleResponse:
    """
    Attributes:
        org_id (str):
        rule (RecurringRule):
        request_id (str):
    """

    org_id: str
    rule: "RecurringRule"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        rule = self.rule.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "rule": rule,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.recurring_rule import RecurringRule

        d = src_dict.copy()
        org_id = d.pop("org_id")

        rule = RecurringRule.from_dict(d.pop("rule"))

        request_id = d.pop("request_id")

        update_recurring_rule_response = cls(
            org_id=org_id,
            rule=rule,
            request_id=request_id,
        )

        return update_recurring_rule_response
