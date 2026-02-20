from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.what_if_scenario_body_scenario import WhatIfScenarioBodyScenario


T = TypeVar("T", bound="WhatIfScenarioBody")


@_attrs_define
class WhatIfScenarioBody:
    """
    Attributes:
        scenario (Union[Unset, WhatIfScenarioBodyScenario]):
    """

    scenario: Union[Unset, "WhatIfScenarioBodyScenario"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        scenario: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.scenario, Unset):
            scenario = self.scenario.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if scenario is not UNSET:
            field_dict["scenario"] = scenario

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.what_if_scenario_body_scenario import WhatIfScenarioBodyScenario

        d = src_dict.copy()
        _scenario = d.pop("scenario", UNSET)
        scenario: Union[Unset, WhatIfScenarioBodyScenario]
        if isinstance(_scenario, Unset):
            scenario = UNSET
        else:
            scenario = WhatIfScenarioBodyScenario.from_dict(_scenario)

        what_if_scenario_body = cls(
            scenario=scenario,
        )

        what_if_scenario_body.additional_properties = d
        return what_if_scenario_body

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
