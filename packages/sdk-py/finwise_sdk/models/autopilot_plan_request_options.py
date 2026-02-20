from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AutopilotPlanRequestOptions")


@_attrs_define
class AutopilotPlanRequestOptions:
    """
    Attributes:
        narrative (Union[Unset, bool]):
    """

    narrative: Union[Unset, bool] = UNSET

    def to_dict(self) -> dict[str, Any]:
        narrative = self.narrative

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if narrative is not UNSET:
            field_dict["narrative"] = narrative

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        narrative = d.pop("narrative", UNSET)

        autopilot_plan_request_options = cls(
            narrative=narrative,
        )

        return autopilot_plan_request_options
