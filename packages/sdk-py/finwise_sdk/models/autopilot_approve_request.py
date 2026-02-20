from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AutopilotApproveRequest")


@_attrs_define
class AutopilotApproveRequest:
    """
    Attributes:
        run_id (str):
        approve_all (Union[Unset, bool]):
        tool_call_ids (Union[Unset, list[str]]):
    """

    run_id: str
    approve_all: Union[Unset, bool] = UNSET
    tool_call_ids: Union[Unset, list[str]] = UNSET

    def to_dict(self) -> dict[str, Any]:
        run_id = self.run_id

        approve_all = self.approve_all

        tool_call_ids: Union[Unset, list[str]] = UNSET
        if not isinstance(self.tool_call_ids, Unset):
            tool_call_ids = self.tool_call_ids

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "run_id": run_id,
            }
        )
        if approve_all is not UNSET:
            field_dict["approve_all"] = approve_all
        if tool_call_ids is not UNSET:
            field_dict["tool_call_ids"] = tool_call_ids

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        run_id = d.pop("run_id")

        approve_all = d.pop("approve_all", UNSET)

        tool_call_ids = cast(list[str], d.pop("tool_call_ids", UNSET))

        autopilot_approve_request = cls(
            run_id=run_id,
            approve_all=approve_all,
            tool_call_ids=tool_call_ids,
        )

        return autopilot_approve_request
