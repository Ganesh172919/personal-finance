from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="CreateFinancialStoryShareRequest")


@_attrs_define
class CreateFinancialStoryShareRequest:
    """
    Attributes:
        expires_in_days (Union[Unset, int]):
        include_goal_names (Union[Unset, bool]):
        include_goal_deadlines (Union[Unset, bool]):
        include_milestones (Union[Unset, bool]):
        max_milestones (Union[Unset, int]):
    """

    expires_in_days: Union[Unset, int] = UNSET
    include_goal_names: Union[Unset, bool] = UNSET
    include_goal_deadlines: Union[Unset, bool] = UNSET
    include_milestones: Union[Unset, bool] = UNSET
    max_milestones: Union[Unset, int] = UNSET

    def to_dict(self) -> dict[str, Any]:
        expires_in_days = self.expires_in_days

        include_goal_names = self.include_goal_names

        include_goal_deadlines = self.include_goal_deadlines

        include_milestones = self.include_milestones

        max_milestones = self.max_milestones

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if expires_in_days is not UNSET:
            field_dict["expires_in_days"] = expires_in_days
        if include_goal_names is not UNSET:
            field_dict["include_goal_names"] = include_goal_names
        if include_goal_deadlines is not UNSET:
            field_dict["include_goal_deadlines"] = include_goal_deadlines
        if include_milestones is not UNSET:
            field_dict["include_milestones"] = include_milestones
        if max_milestones is not UNSET:
            field_dict["max_milestones"] = max_milestones

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        expires_in_days = d.pop("expires_in_days", UNSET)

        include_goal_names = d.pop("include_goal_names", UNSET)

        include_goal_deadlines = d.pop("include_goal_deadlines", UNSET)

        include_milestones = d.pop("include_milestones", UNSET)

        max_milestones = d.pop("max_milestones", UNSET)

        create_financial_story_share_request = cls(
            expires_in_days=expires_in_days,
            include_goal_names=include_goal_names,
            include_goal_deadlines=include_goal_deadlines,
            include_milestones=include_milestones,
            max_milestones=max_milestones,
        )

        return create_financial_story_share_request
