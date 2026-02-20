from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.create_workflow_response_workflow import (
        CreateWorkflowResponseWorkflow,
    )


T = TypeVar("T", bound="CreateWorkflowResponse")


@_attrs_define
class CreateWorkflowResponse:
    """
    Attributes:
        workflow (CreateWorkflowResponseWorkflow):
        request_id (str):
    """

    workflow: "CreateWorkflowResponseWorkflow"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        workflow = self.workflow.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "workflow": workflow,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_workflow_response_workflow import (
            CreateWorkflowResponseWorkflow,
        )

        d = src_dict.copy()
        workflow = CreateWorkflowResponseWorkflow.from_dict(d.pop("workflow"))

        request_id = d.pop("request_id")

        create_workflow_response = cls(
            workflow=workflow,
            request_id=request_id,
        )

        return create_workflow_response
