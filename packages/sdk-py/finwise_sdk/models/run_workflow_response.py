from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.workflow_run import WorkflowRun


T = TypeVar("T", bound="RunWorkflowResponse")


@_attrs_define
class RunWorkflowResponse:
    """
    Attributes:
        queued (bool):
        run (WorkflowRun):
        request_id (str):
    """

    queued: bool
    run: "WorkflowRun"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        queued = self.queued

        run = self.run.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "queued": queued,
                "run": run,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.workflow_run import WorkflowRun

        d = src_dict.copy()
        queued = d.pop("queued")

        run = WorkflowRun.from_dict(d.pop("run"))

        request_id = d.pop("request_id")

        run_workflow_response = cls(
            queued=queued,
            run=run,
            request_id=request_id,
        )

        return run_workflow_response
