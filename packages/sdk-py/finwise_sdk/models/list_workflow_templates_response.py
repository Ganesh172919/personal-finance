from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.workflow_template import WorkflowTemplate


T = TypeVar("T", bound="ListWorkflowTemplatesResponse")


@_attrs_define
class ListWorkflowTemplatesResponse:
    """
    Attributes:
        org_id (str):
        templates (list['WorkflowTemplate']):
        request_id (str):
    """

    org_id: str
    templates: list["WorkflowTemplate"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        templates = []
        for templates_item_data in self.templates:
            templates_item = templates_item_data.to_dict()
            templates.append(templates_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "templates": templates,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.workflow_template import WorkflowTemplate

        d = src_dict.copy()
        org_id = d.pop("org_id")

        templates = []
        _templates = d.pop("templates")
        for templates_item_data in _templates:
            templates_item = WorkflowTemplate.from_dict(templates_item_data)

            templates.append(templates_item)

        request_id = d.pop("request_id")

        list_workflow_templates_response = cls(
            org_id=org_id,
            templates=templates,
            request_id=request_id,
        )

        return list_workflow_templates_response
