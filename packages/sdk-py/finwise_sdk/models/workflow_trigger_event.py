from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.workflow_trigger_event_type import WorkflowTriggerEventType

T = TypeVar("T", bound="WorkflowTriggerEvent")


@_attrs_define
class WorkflowTriggerEvent:
    """
    Attributes:
        type_ (WorkflowTriggerEventType):
        event_type (str):
    """

    type_: WorkflowTriggerEventType
    event_type: str

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        event_type = self.event_type

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "event_type": event_type,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        type_ = WorkflowTriggerEventType(d.pop("type"))

        event_type = d.pop("event_type")

        workflow_trigger_event = cls(
            type_=type_,
            event_type=event_type,
        )

        return workflow_trigger_event
