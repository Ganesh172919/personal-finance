from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.tools_execute_response_result import ToolsExecuteResponseResult


T = TypeVar("T", bound="ToolsExecuteResponse")


@_attrs_define
class ToolsExecuteResponse:
    """
    Attributes:
        ok (bool):
        tool_execution_id (str):
        tool_call_id (str):
        tool (str):
        idempotency_key (str):
        idempotent_replay (bool):
        result (ToolsExecuteResponseResult):
        request_id (str):
    """

    ok: bool
    tool_execution_id: str
    tool_call_id: str
    tool: str
    idempotency_key: str
    idempotent_replay: bool
    result: "ToolsExecuteResponseResult"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        ok = self.ok

        tool_execution_id = self.tool_execution_id

        tool_call_id = self.tool_call_id

        tool = self.tool

        idempotency_key = self.idempotency_key

        idempotent_replay = self.idempotent_replay

        result = self.result.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "ok": ok,
                "tool_execution_id": tool_execution_id,
                "tool_call_id": tool_call_id,
                "tool": tool,
                "idempotency_key": idempotency_key,
                "idempotent_replay": idempotent_replay,
                "result": result,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.tools_execute_response_result import ToolsExecuteResponseResult

        d = src_dict.copy()
        ok = d.pop("ok")

        tool_execution_id = d.pop("tool_execution_id")

        tool_call_id = d.pop("tool_call_id")

        tool = d.pop("tool")

        idempotency_key = d.pop("idempotency_key")

        idempotent_replay = d.pop("idempotent_replay")

        result = ToolsExecuteResponseResult.from_dict(d.pop("result"))

        request_id = d.pop("request_id")

        tools_execute_response = cls(
            ok=ok,
            tool_execution_id=tool_execution_id,
            tool_call_id=tool_call_id,
            tool=tool,
            idempotency_key=idempotency_key,
            idempotent_replay=idempotent_replay,
            result=result,
            request_id=request_id,
        )

        return tools_execute_response
