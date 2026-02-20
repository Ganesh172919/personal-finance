from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.workflow import Workflow


T = TypeVar("T", bound="ListWorkflowsResponse")


@_attrs_define
class ListWorkflowsResponse:
    """
    Attributes:
        workflows (list['Workflow']):
        request_id (str):
    """

    workflows: list["Workflow"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        workflows = []
        for workflows_item_data in self.workflows:
            workflows_item = workflows_item_data.to_dict()
            workflows.append(workflows_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "workflows": workflows,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.workflow import Workflow

        d = src_dict.copy()
        workflows = []
        _workflows = d.pop("workflows")
        for workflows_item_data in _workflows:
            workflows_item = Workflow.from_dict(workflows_item_data)

            workflows.append(workflows_item)

        request_id = d.pop("request_id")

        list_workflows_response = cls(
            workflows=workflows,
            request_id=request_id,
        )

        return list_workflows_response
