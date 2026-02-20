from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="EntitlementSnapshotUsage")


@_attrs_define
class EntitlementSnapshotUsage:
    """
    Attributes:
        monthly_ai_calls (int):
        scenario_depth (int):
        ocr_quota (int):
        export_access (int):
        api_requests (int):
        autopilot_actions (int):
        workflow_runs (int):
        connector_sync_records (int):
        marketplace_installs (int):
    """

    monthly_ai_calls: int
    scenario_depth: int
    ocr_quota: int
    export_access: int
    api_requests: int
    autopilot_actions: int
    workflow_runs: int
    connector_sync_records: int
    marketplace_installs: int

    def to_dict(self) -> dict[str, Any]:
        monthly_ai_calls = self.monthly_ai_calls

        scenario_depth = self.scenario_depth

        ocr_quota = self.ocr_quota

        export_access = self.export_access

        api_requests = self.api_requests

        autopilot_actions = self.autopilot_actions

        workflow_runs = self.workflow_runs

        connector_sync_records = self.connector_sync_records

        marketplace_installs = self.marketplace_installs

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "monthly_ai_calls": monthly_ai_calls,
                "scenario_depth": scenario_depth,
                "ocr_quota": ocr_quota,
                "export_access": export_access,
                "api_requests": api_requests,
                "autopilot_actions": autopilot_actions,
                "workflow_runs": workflow_runs,
                "connector_sync_records": connector_sync_records,
                "marketplace_installs": marketplace_installs,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        monthly_ai_calls = d.pop("monthly_ai_calls")

        scenario_depth = d.pop("scenario_depth")

        ocr_quota = d.pop("ocr_quota")

        export_access = d.pop("export_access")

        api_requests = d.pop("api_requests")

        autopilot_actions = d.pop("autopilot_actions")

        workflow_runs = d.pop("workflow_runs")

        connector_sync_records = d.pop("connector_sync_records")

        marketplace_installs = d.pop("marketplace_installs")

        entitlement_snapshot_usage = cls(
            monthly_ai_calls=monthly_ai_calls,
            scenario_depth=scenario_depth,
            ocr_quota=ocr_quota,
            export_access=export_access,
            api_requests=api_requests,
            autopilot_actions=autopilot_actions,
            workflow_runs=workflow_runs,
            connector_sync_records=connector_sync_records,
            marketplace_installs=marketplace_installs,
        )

        return entitlement_snapshot_usage
