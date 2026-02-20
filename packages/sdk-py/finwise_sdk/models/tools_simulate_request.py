from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.tool_call import ToolCall


T = TypeVar("T", bound="ToolsSimulateRequest")


@_attrs_define
class ToolsSimulateRequest:
    """
    Attributes:
        tool_call (ToolCall):
    """

    tool_call: "ToolCall"

    def to_dict(self) -> dict[str, Any]:
        tool_call = self.tool_call.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "tool_call": tool_call,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.tool_call import ToolCall

        d = src_dict.copy()
        tool_call = ToolCall.from_dict(d.pop("tool_call"))

        tools_simulate_request = cls(
            tool_call=tool_call,
        )

        return tools_simulate_request
