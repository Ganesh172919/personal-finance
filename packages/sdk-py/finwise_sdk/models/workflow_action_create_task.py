from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define

from ..models.task_kind import TaskKind
from ..models.task_priority import TaskPriority
from ..models.workflow_action_create_task_bucket import WorkflowActionCreateTaskBucket
from ..models.workflow_action_create_task_type import WorkflowActionCreateTaskType
from ..types import UNSET, Unset

T = TypeVar("T", bound="WorkflowActionCreateTask")


@_attrs_define
class WorkflowActionCreateTask:
    """
    Attributes:
        type_ (WorkflowActionCreateTaskType):
        bucket (WorkflowActionCreateTaskBucket):
        title (str):
        why (str):
        expected_impact (str):
        steps (Union[Unset, list[str]]):
        priority (Union[Unset, TaskPriority]):
        kind (Union[Unset, TaskKind]):
        due_days (Union[Unset, int]):
    """

    type_: WorkflowActionCreateTaskType
    bucket: WorkflowActionCreateTaskBucket
    title: str
    why: str
    expected_impact: str
    steps: Union[Unset, list[str]] = UNSET
    priority: Union[Unset, TaskPriority] = UNSET
    kind: Union[Unset, TaskKind] = UNSET
    due_days: Union[Unset, int] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        bucket = self.bucket.value

        title = self.title

        why = self.why

        expected_impact = self.expected_impact

        steps: Union[Unset, list[str]] = UNSET
        if not isinstance(self.steps, Unset):
            steps = self.steps

        priority: Union[Unset, str] = UNSET
        if not isinstance(self.priority, Unset):
            priority = self.priority.value

        kind: Union[Unset, str] = UNSET
        if not isinstance(self.kind, Unset):
            kind = self.kind.value

        due_days = self.due_days

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "bucket": bucket,
                "title": title,
                "why": why,
                "expected_impact": expected_impact,
            }
        )
        if steps is not UNSET:
            field_dict["steps"] = steps
        if priority is not UNSET:
            field_dict["priority"] = priority
        if kind is not UNSET:
            field_dict["kind"] = kind
        if due_days is not UNSET:
            field_dict["due_days"] = due_days

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        type_ = WorkflowActionCreateTaskType(d.pop("type"))

        bucket = WorkflowActionCreateTaskBucket(d.pop("bucket"))

        title = d.pop("title")

        why = d.pop("why")

        expected_impact = d.pop("expected_impact")

        steps = cast(list[str], d.pop("steps", UNSET))

        _priority = d.pop("priority", UNSET)
        priority: Union[Unset, TaskPriority]
        if isinstance(_priority, Unset):
            priority = UNSET
        else:
            priority = TaskPriority(_priority)

        _kind = d.pop("kind", UNSET)
        kind: Union[Unset, TaskKind]
        if isinstance(_kind, Unset):
            kind = UNSET
        else:
            kind = TaskKind(_kind)

        due_days = d.pop("due_days", UNSET)

        workflow_action_create_task = cls(
            type_=type_,
            bucket=bucket,
            title=title,
            why=why,
            expected_impact=expected_impact,
            steps=steps,
            priority=priority,
            kind=kind,
            due_days=due_days,
        )

        return workflow_action_create_task
