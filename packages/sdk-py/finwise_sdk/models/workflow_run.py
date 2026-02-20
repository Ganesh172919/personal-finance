import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.workflow_run_status import WorkflowRunStatus

if TYPE_CHECKING:
    from ..models.workflow_run_result import WorkflowRunResult


T = TypeVar("T", bound="WorkflowRun")


@_attrs_define
class WorkflowRun:
    """
    Attributes:
        id (str):
        status (WorkflowRunStatus):
        started_at (Union[None, datetime.datetime]):
        finished_at (Union[None, datetime.datetime]):
        result (Union['WorkflowRunResult', None]):
        error (Union[None, str]):
    """

    id: str
    status: WorkflowRunStatus
    started_at: Union[None, datetime.datetime]
    finished_at: Union[None, datetime.datetime]
    result: Union["WorkflowRunResult", None]
    error: Union[None, str]

    def to_dict(self) -> dict[str, Any]:
        from ..models.workflow_run_result import WorkflowRunResult

        id = self.id

        status = self.status.value

        started_at: Union[None, str]
        if isinstance(self.started_at, datetime.datetime):
            started_at = self.started_at.isoformat()
        else:
            started_at = self.started_at

        finished_at: Union[None, str]
        if isinstance(self.finished_at, datetime.datetime):
            finished_at = self.finished_at.isoformat()
        else:
            finished_at = self.finished_at

        result: Union[None, dict[str, Any]]
        if isinstance(self.result, WorkflowRunResult):
            result = self.result.to_dict()
        else:
            result = self.result

        error: Union[None, str]
        error = self.error

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "status": status,
                "started_at": started_at,
                "finished_at": finished_at,
                "result": result,
                "error": error,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.workflow_run_result import WorkflowRunResult

        d = src_dict.copy()
        id = d.pop("id")

        status = WorkflowRunStatus(d.pop("status"))

        def _parse_started_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                started_at_type_1 = isoparse(data)

                return started_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        started_at = _parse_started_at(d.pop("started_at"))

        def _parse_finished_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                finished_at_type_1 = isoparse(data)

                return finished_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        finished_at = _parse_finished_at(d.pop("finished_at"))

        def _parse_result(data: object) -> Union["WorkflowRunResult", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                result_type_1 = WorkflowRunResult.from_dict(data)

                return result_type_1
            except:  # noqa: E722
                pass
            return cast(Union["WorkflowRunResult", None], data)

        result = _parse_result(d.pop("result"))

        def _parse_error(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        error = _parse_error(d.pop("error"))

        workflow_run = cls(
            id=id,
            status=status,
            started_at=started_at,
            finished_at=finished_at,
            result=result,
            error=error,
        )

        return workflow_run
