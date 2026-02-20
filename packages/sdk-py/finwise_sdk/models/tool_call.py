from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

from ..models.tool_risk import ToolRisk

if TYPE_CHECKING:
    from ..models.tool_call_args import ToolCallArgs


T = TypeVar("T", bound="ToolCall")


@_attrs_define
class ToolCall:
    """
    Attributes:
        id (str):
        title (str):
        description (str):
        requires_confirmation (bool):
        risk (ToolRisk):
        tool (str):
        args (ToolCallArgs):
    """

    id: str
    title: str
    description: str
    requires_confirmation: bool
    risk: ToolRisk
    tool: str
    args: "ToolCallArgs"

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        title = self.title

        description = self.description

        requires_confirmation = self.requires_confirmation

        risk = self.risk.value

        tool = self.tool

        args = self.args.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "title": title,
                "description": description,
                "requires_confirmation": requires_confirmation,
                "risk": risk,
                "tool": tool,
                "args": args,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.tool_call_args import ToolCallArgs

        d = src_dict.copy()
        id = d.pop("id")

        title = d.pop("title")

        description = d.pop("description")

        requires_confirmation = d.pop("requires_confirmation")

        risk = ToolRisk(d.pop("risk"))

        tool = d.pop("tool")

        args = ToolCallArgs.from_dict(d.pop("args"))

        tool_call = cls(
            id=id,
            title=title,
            description=description,
            requires_confirmation=requires_confirmation,
            risk=risk,
            tool=tool,
            args=args,
        )

        return tool_call
