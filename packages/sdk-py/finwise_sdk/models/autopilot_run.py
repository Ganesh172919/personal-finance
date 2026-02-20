import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.autopilot_run_status import AutopilotRunStatus

if TYPE_CHECKING:
    from ..models.autopilot_run_ai import AutopilotRunAi
    from ..models.autopilot_run_approvals import AutopilotRunApprovals
    from ..models.autopilot_run_executions_item import AutopilotRunExecutionsItem
    from ..models.autopilot_run_simulations_item import AutopilotRunSimulationsItem
    from ..models.tool_call import ToolCall


T = TypeVar("T", bound="AutopilotRun")


@_attrs_define
class AutopilotRun:
    """
    Attributes:
        id (str):
        goal (str):
        status (AutopilotRunStatus):
        ai (AutopilotRunAi):
        tool_calls (list['ToolCall']):
        simulations (list['AutopilotRunSimulationsItem']):
        approvals (AutopilotRunApprovals):
        executions (list['AutopilotRunExecutionsItem']):
        error (Union[None, str]):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    id: str
    goal: str
    status: AutopilotRunStatus
    ai: "AutopilotRunAi"
    tool_calls: list["ToolCall"]
    simulations: list["AutopilotRunSimulationsItem"]
    approvals: "AutopilotRunApprovals"
    executions: list["AutopilotRunExecutionsItem"]
    error: Union[None, str]
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        goal = self.goal

        status = self.status.value

        ai = self.ai.to_dict()

        tool_calls = []
        for tool_calls_item_data in self.tool_calls:
            tool_calls_item = tool_calls_item_data.to_dict()
            tool_calls.append(tool_calls_item)

        simulations = []
        for simulations_item_data in self.simulations:
            simulations_item = simulations_item_data.to_dict()
            simulations.append(simulations_item)

        approvals = self.approvals.to_dict()

        executions = []
        for executions_item_data in self.executions:
            executions_item = executions_item_data.to_dict()
            executions.append(executions_item)

        error: Union[None, str]
        error = self.error

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "goal": goal,
                "status": status,
                "ai": ai,
                "tool_calls": tool_calls,
                "simulations": simulations,
                "approvals": approvals,
                "executions": executions,
                "error": error,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.autopilot_run_ai import AutopilotRunAi
        from ..models.autopilot_run_approvals import AutopilotRunApprovals
        from ..models.autopilot_run_executions_item import AutopilotRunExecutionsItem
        from ..models.autopilot_run_simulations_item import AutopilotRunSimulationsItem
        from ..models.tool_call import ToolCall

        d = src_dict.copy()
        id = d.pop("id")

        goal = d.pop("goal")

        status = AutopilotRunStatus(d.pop("status"))

        ai = AutopilotRunAi.from_dict(d.pop("ai"))

        tool_calls = []
        _tool_calls = d.pop("tool_calls")
        for tool_calls_item_data in _tool_calls:
            tool_calls_item = ToolCall.from_dict(tool_calls_item_data)

            tool_calls.append(tool_calls_item)

        simulations = []
        _simulations = d.pop("simulations")
        for simulations_item_data in _simulations:
            simulations_item = AutopilotRunSimulationsItem.from_dict(
                simulations_item_data
            )

            simulations.append(simulations_item)

        approvals = AutopilotRunApprovals.from_dict(d.pop("approvals"))

        executions = []
        _executions = d.pop("executions")
        for executions_item_data in _executions:
            executions_item = AutopilotRunExecutionsItem.from_dict(executions_item_data)

            executions.append(executions_item)

        def _parse_error(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        error = _parse_error(d.pop("error"))

        def _parse_created_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_1 = isoparse(data)

                return created_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        created_at = _parse_created_at(d.pop("created_at"))

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        autopilot_run = cls(
            id=id,
            goal=goal,
            status=status,
            ai=ai,
            tool_calls=tool_calls,
            simulations=simulations,
            approvals=approvals,
            executions=executions,
            error=error,
            created_at=created_at,
            updated_at=updated_at,
        )

        return autopilot_run
