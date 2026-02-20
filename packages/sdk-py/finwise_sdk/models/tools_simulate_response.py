from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.tools_simulate_response_preview import ToolsSimulateResponsePreview


T = TypeVar("T", bound="ToolsSimulateResponse")


@_attrs_define
class ToolsSimulateResponse:
    """
    Attributes:
        ok (bool):
        tool_call_id (str):
        tool (str):
        requires_confirmation (bool):
        risk (str):
        preview (ToolsSimulateResponsePreview):
        request_id (str):
    """

    ok: bool
    tool_call_id: str
    tool: str
    requires_confirmation: bool
    risk: str
    preview: "ToolsSimulateResponsePreview"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        ok = self.ok

        tool_call_id = self.tool_call_id

        tool = self.tool

        requires_confirmation = self.requires_confirmation

        risk = self.risk

        preview = self.preview.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "ok": ok,
                "tool_call_id": tool_call_id,
                "tool": tool,
                "requires_confirmation": requires_confirmation,
                "risk": risk,
                "preview": preview,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.tools_simulate_response_preview import (
            ToolsSimulateResponsePreview,
        )

        d = src_dict.copy()
        ok = d.pop("ok")

        tool_call_id = d.pop("tool_call_id")

        tool = d.pop("tool")

        requires_confirmation = d.pop("requires_confirmation")

        risk = d.pop("risk")

        preview = ToolsSimulateResponsePreview.from_dict(d.pop("preview"))

        request_id = d.pop("request_id")

        tools_simulate_response = cls(
            ok=ok,
            tool_call_id=tool_call_id,
            tool=tool,
            requires_confirmation=requires_confirmation,
            risk=risk,
            preview=preview,
            request_id=request_id,
        )

        return tools_simulate_response
