from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.tool_call import ToolCall


T = TypeVar("T", bound="ToolsExecuteRequest")


@_attrs_define
class ToolsExecuteRequest:
    """
    Attributes:
        tool_call (ToolCall):
        confirm (Union[Unset, bool]):
        idempotency_key (Union[Unset, str]):
    """

    tool_call: "ToolCall"
    confirm: Union[Unset, bool] = UNSET
    idempotency_key: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        tool_call = self.tool_call.to_dict()

        confirm = self.confirm

        idempotency_key = self.idempotency_key

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "tool_call": tool_call,
            }
        )
        if confirm is not UNSET:
            field_dict["confirm"] = confirm
        if idempotency_key is not UNSET:
            field_dict["idempotency_key"] = idempotency_key

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.tool_call import ToolCall

        d = src_dict.copy()
        tool_call = ToolCall.from_dict(d.pop("tool_call"))

        confirm = d.pop("confirm", UNSET)

        idempotency_key = d.pop("idempotency_key", UNSET)

        tools_execute_request = cls(
            tool_call=tool_call,
            confirm=confirm,
            idempotency_key=idempotency_key,
        )

        return tools_execute_request
