from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.workflow_trigger_manual_type import WorkflowTriggerManualType

T = TypeVar("T", bound="WorkflowTriggerManual")


@_attrs_define
class WorkflowTriggerManual:
    """
    Attributes:
        type_ (WorkflowTriggerManualType):
    """

    type_: WorkflowTriggerManualType

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        type_ = WorkflowTriggerManualType(d.pop("type"))

        workflow_trigger_manual = cls(
            type_=type_,
        )

        return workflow_trigger_manual
