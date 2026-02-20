from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AnalyticsOverviewResponseMetrics")


@_attrs_define
class AnalyticsOverviewResponseMetrics:
    """
    Attributes:
        active_workflows (int):
        workflow_runs_30d (int):
        exports_30d (int):
        connected_integrations (int):
        installed_plugins (int):
        feature_flags (int):
    """

    active_workflows: int
    workflow_runs_30d: int
    exports_30d: int
    connected_integrations: int
    installed_plugins: int
    feature_flags: int

    def to_dict(self) -> dict[str, Any]:
        active_workflows = self.active_workflows

        workflow_runs_30d = self.workflow_runs_30d

        exports_30d = self.exports_30d

        connected_integrations = self.connected_integrations

        installed_plugins = self.installed_plugins

        feature_flags = self.feature_flags

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "active_workflows": active_workflows,
                "workflow_runs_30d": workflow_runs_30d,
                "exports_30d": exports_30d,
                "connected_integrations": connected_integrations,
                "installed_plugins": installed_plugins,
                "feature_flags": feature_flags,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        active_workflows = d.pop("active_workflows")

        workflow_runs_30d = d.pop("workflow_runs_30d")

        exports_30d = d.pop("exports_30d")

        connected_integrations = d.pop("connected_integrations")

        installed_plugins = d.pop("installed_plugins")

        feature_flags = d.pop("feature_flags")

        analytics_overview_response_metrics = cls(
            active_workflows=active_workflows,
            workflow_runs_30d=workflow_runs_30d,
            exports_30d=exports_30d,
            connected_integrations=connected_integrations,
            installed_plugins=installed_plugins,
            feature_flags=feature_flags,
        )

        return analytics_overview_response_metrics
