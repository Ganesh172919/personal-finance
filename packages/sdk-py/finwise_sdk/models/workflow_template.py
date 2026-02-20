from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.create_workflow_request import CreateWorkflowRequest


T = TypeVar("T", bound="WorkflowTemplate")


@_attrs_define
class WorkflowTemplate:
    """
    Attributes:
        template_key (str):
        plugin_key (str):
        plugin_version (Union[None, str]):
        name (str):
        description (str):
        request (CreateWorkflowRequest):
    """

    template_key: str
    plugin_key: str
    plugin_version: Union[None, str]
    name: str
    description: str
    request: "CreateWorkflowRequest"

    def to_dict(self) -> dict[str, Any]:
        template_key = self.template_key

        plugin_key = self.plugin_key

        plugin_version: Union[None, str]
        plugin_version = self.plugin_version

        name = self.name

        description = self.description

        request = self.request.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "template_key": template_key,
                "plugin_key": plugin_key,
                "plugin_version": plugin_version,
                "name": name,
                "description": description,
                "request": request,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_workflow_request import CreateWorkflowRequest

        d = src_dict.copy()
        template_key = d.pop("template_key")

        plugin_key = d.pop("plugin_key")

        def _parse_plugin_version(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        plugin_version = _parse_plugin_version(d.pop("plugin_version"))

        name = d.pop("name")

        description = d.pop("description")

        request = CreateWorkflowRequest.from_dict(d.pop("request"))

        workflow_template = cls(
            template_key=template_key,
            plugin_key=plugin_key,
            plugin_version=plugin_version,
            name=name,
            description=description,
            request=request,
        )

        return workflow_template
