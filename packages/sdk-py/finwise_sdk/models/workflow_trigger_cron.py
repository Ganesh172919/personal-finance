from typing import Any, TypeVar

from attrs import define as _attrs_define

from ..models.workflow_trigger_cron_type import WorkflowTriggerCronType

T = TypeVar("T", bound="WorkflowTriggerCron")


@_attrs_define
class WorkflowTriggerCron:
    """
    Attributes:
        type_ (WorkflowTriggerCronType):
        cron (str):
    """

    type_: WorkflowTriggerCronType
    cron: str

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        cron = self.cron

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "cron": cron,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        type_ = WorkflowTriggerCronType(d.pop("type"))

        cron = d.pop("cron")

        workflow_trigger_cron = cls(
            type_=type_,
            cron=cron,
        )

        return workflow_trigger_cron
