from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.autopilot_plan_request_options import AutopilotPlanRequestOptions


T = TypeVar("T", bound="AutopilotPlanRequest")


@_attrs_define
class AutopilotPlanRequest:
    """
    Attributes:
        goal (str):
        options (Union[Unset, AutopilotPlanRequestOptions]):
    """

    goal: str
    options: Union[Unset, "AutopilotPlanRequestOptions"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        goal = self.goal

        options: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.options, Unset):
            options = self.options.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "goal": goal,
            }
        )
        if options is not UNSET:
            field_dict["options"] = options

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.autopilot_plan_request_options import AutopilotPlanRequestOptions

        d = src_dict.copy()
        goal = d.pop("goal")

        _options = d.pop("options", UNSET)
        options: Union[Unset, AutopilotPlanRequestOptions]
        if isinstance(_options, Unset):
            options = UNSET
        else:
            options = AutopilotPlanRequestOptions.from_dict(_options)

        autopilot_plan_request = cls(
            goal=goal,
            options=options,
        )

        return autopilot_plan_request
