from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="SubmitAgentOutputFeedbackBody")


@_attrs_define
class SubmitAgentOutputFeedbackBody:
    """
    Attributes:
        helpful (Union[Unset, bool]):
        rating (Union[Unset, int]):
    """

    helpful: Union[Unset, bool] = UNSET
    rating: Union[Unset, int] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        helpful = self.helpful

        rating = self.rating

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update({})
        if helpful is not UNSET:
            field_dict["helpful"] = helpful
        if rating is not UNSET:
            field_dict["rating"] = rating

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        helpful = d.pop("helpful", UNSET)

        rating = d.pop("rating", UNSET)

        submit_agent_output_feedback_body = cls(
            helpful=helpful,
            rating=rating,
        )

        submit_agent_output_feedback_body.additional_properties = d
        return submit_agent_output_feedback_body

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
