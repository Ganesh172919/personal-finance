from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="FinancialStorySharePayloadGoalsItem")


@_attrs_define
class FinancialStorySharePayloadGoalsItem:
    """
    Attributes:
        name (str):
        target (float):
        current (float):
        priority (int):
        deadline (Union[None, Unset, str]):
    """

    name: str
    target: float
    current: float
    priority: int
    deadline: Union[None, Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        target = self.target

        current = self.current

        priority = self.priority

        deadline: Union[None, Unset, str]
        if isinstance(self.deadline, Unset):
            deadline = UNSET
        else:
            deadline = self.deadline

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
                "target": target,
                "current": current,
                "priority": priority,
            }
        )
        if deadline is not UNSET:
            field_dict["deadline"] = deadline

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name")

        target = d.pop("target")

        current = d.pop("current")

        priority = d.pop("priority")

        def _parse_deadline(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        deadline = _parse_deadline(d.pop("deadline", UNSET))

        financial_story_share_payload_goals_item = cls(
            name=name,
            target=target,
            current=current,
            priority=priority,
            deadline=deadline,
        )

        return financial_story_share_payload_goals_item
