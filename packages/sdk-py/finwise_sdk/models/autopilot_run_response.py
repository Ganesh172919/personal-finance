from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.autopilot_run import AutopilotRun


T = TypeVar("T", bound="AutopilotRunResponse")


@_attrs_define
class AutopilotRunResponse:
    """
    Attributes:
        ok (bool):
        org_id (str):
        run (AutopilotRun):
        request_id (str):
    """

    ok: bool
    org_id: str
    run: "AutopilotRun"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        ok = self.ok

        org_id = self.org_id

        run = self.run.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "ok": ok,
                "org_id": org_id,
                "run": run,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.autopilot_run import AutopilotRun

        d = src_dict.copy()
        ok = d.pop("ok")

        org_id = d.pop("org_id")

        run = AutopilotRun.from_dict(d.pop("run"))

        request_id = d.pop("request_id")

        autopilot_run_response = cls(
            ok=ok,
            org_id=org_id,
            run=run,
            request_id=request_id,
        )

        return autopilot_run_response
