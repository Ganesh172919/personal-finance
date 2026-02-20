import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.workflow_action_create_task import WorkflowActionCreateTask
    from ..models.workflow_action_export_report_monthly_summary_pdf import (
        WorkflowActionExportReportMonthlySummaryPdf,
    )
    from ..models.workflow_action_export_report_transactions_csv import (
        WorkflowActionExportReportTransactionsCsv,
    )
    from ..models.workflow_action_send_notification import (
        WorkflowActionSendNotification,
    )
    from ..models.workflow_trigger_cron import WorkflowTriggerCron
    from ..models.workflow_trigger_event import WorkflowTriggerEvent
    from ..models.workflow_trigger_manual import WorkflowTriggerManual


T = TypeVar("T", bound="CreateWorkflowResponseWorkflow")


@_attrs_define
class CreateWorkflowResponseWorkflow:
    """
    Attributes:
        id (str):
        name (str):
        enabled (bool):
        trigger (Union['WorkflowTriggerCron', 'WorkflowTriggerEvent', 'WorkflowTriggerManual']):
        actions (list[Union['WorkflowActionCreateTask', 'WorkflowActionExportReportMonthlySummaryPdf',
            'WorkflowActionExportReportTransactionsCsv', 'WorkflowActionSendNotification']]):
        created_at (datetime.datetime):
    """

    id: str
    name: str
    enabled: bool
    trigger: Union[
        "WorkflowTriggerCron", "WorkflowTriggerEvent", "WorkflowTriggerManual"
    ]
    actions: list[
        Union[
            "WorkflowActionCreateTask",
            "WorkflowActionExportReportMonthlySummaryPdf",
            "WorkflowActionExportReportTransactionsCsv",
            "WorkflowActionSendNotification",
        ]
    ]
    created_at: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        from ..models.workflow_action_create_task import WorkflowActionCreateTask
        from ..models.workflow_action_export_report_transactions_csv import (
            WorkflowActionExportReportTransactionsCsv,
        )
        from ..models.workflow_action_send_notification import (
            WorkflowActionSendNotification,
        )
        from ..models.workflow_trigger_cron import WorkflowTriggerCron
        from ..models.workflow_trigger_manual import WorkflowTriggerManual

        id = self.id

        name = self.name

        enabled = self.enabled

        trigger: dict[str, Any]
        if isinstance(self.trigger, WorkflowTriggerManual):
            trigger = self.trigger.to_dict()
        elif isinstance(self.trigger, WorkflowTriggerCron):
            trigger = self.trigger.to_dict()
        else:
            trigger = self.trigger.to_dict()

        actions = []
        for actions_item_data in self.actions:
            actions_item: dict[str, Any]
            if isinstance(actions_item_data, WorkflowActionCreateTask):
                actions_item = actions_item_data.to_dict()
            elif isinstance(actions_item_data, WorkflowActionSendNotification):
                actions_item = actions_item_data.to_dict()
            elif isinstance(
                actions_item_data, WorkflowActionExportReportTransactionsCsv
            ):
                actions_item = actions_item_data.to_dict()
            else:
                actions_item = actions_item_data.to_dict()

            actions.append(actions_item)

        created_at = self.created_at.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "enabled": enabled,
                "trigger": trigger,
                "actions": actions,
                "created_at": created_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.workflow_action_create_task import WorkflowActionCreateTask
        from ..models.workflow_action_export_report_monthly_summary_pdf import (
            WorkflowActionExportReportMonthlySummaryPdf,
        )
        from ..models.workflow_action_export_report_transactions_csv import (
            WorkflowActionExportReportTransactionsCsv,
        )
        from ..models.workflow_action_send_notification import (
            WorkflowActionSendNotification,
        )
        from ..models.workflow_trigger_cron import WorkflowTriggerCron
        from ..models.workflow_trigger_event import WorkflowTriggerEvent
        from ..models.workflow_trigger_manual import WorkflowTriggerManual

        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        enabled = d.pop("enabled")

        def _parse_trigger(
            data: object,
        ) -> Union[
            "WorkflowTriggerCron", "WorkflowTriggerEvent", "WorkflowTriggerManual"
        ]:
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_workflow_trigger_type_0 = (
                    WorkflowTriggerManual.from_dict(data)
                )

                return componentsschemas_workflow_trigger_type_0
            except:  # noqa: E722
                pass
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_workflow_trigger_type_1 = (
                    WorkflowTriggerCron.from_dict(data)
                )

                return componentsschemas_workflow_trigger_type_1
            except:  # noqa: E722
                pass
            if not isinstance(data, dict):
                raise TypeError()
            componentsschemas_workflow_trigger_type_2 = WorkflowTriggerEvent.from_dict(
                data
            )

            return componentsschemas_workflow_trigger_type_2

        trigger = _parse_trigger(d.pop("trigger"))

        actions = []
        _actions = d.pop("actions")
        for actions_item_data in _actions:

            def _parse_actions_item(
                data: object,
            ) -> Union[
                "WorkflowActionCreateTask",
                "WorkflowActionExportReportMonthlySummaryPdf",
                "WorkflowActionExportReportTransactionsCsv",
                "WorkflowActionSendNotification",
            ]:
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_workflow_action_type_0 = (
                        WorkflowActionCreateTask.from_dict(data)
                    )

                    return componentsschemas_workflow_action_type_0
                except:  # noqa: E722
                    pass
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_workflow_action_type_1 = (
                        WorkflowActionSendNotification.from_dict(data)
                    )

                    return componentsschemas_workflow_action_type_1
                except:  # noqa: E722
                    pass
                try:
                    if not isinstance(data, dict):
                        raise TypeError()
                    componentsschemas_workflow_action_export_report_type_0 = (
                        WorkflowActionExportReportTransactionsCsv.from_dict(data)
                    )

                    return componentsschemas_workflow_action_export_report_type_0
                except:  # noqa: E722
                    pass
                if not isinstance(data, dict):
                    raise TypeError()
                componentsschemas_workflow_action_export_report_type_1 = (
                    WorkflowActionExportReportMonthlySummaryPdf.from_dict(data)
                )

                return componentsschemas_workflow_action_export_report_type_1

            actions_item = _parse_actions_item(actions_item_data)

            actions.append(actions_item)

        created_at = isoparse(d.pop("created_at"))

        create_workflow_response_workflow = cls(
            id=id,
            name=name,
            enabled=enabled,
            trigger=trigger,
            actions=actions,
            created_at=created_at,
        )

        return create_workflow_response_workflow
