from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.integration_sync_response_run import IntegrationSyncResponseRun


T = TypeVar("T", bound="IntegrationSyncResponse")


@_attrs_define
class IntegrationSyncResponse:
    """
    Attributes:
        org_id (str):
        queued (bool):
        run (IntegrationSyncResponseRun):
        request_id (str):
    """

    org_id: str
    queued: bool
    run: "IntegrationSyncResponseRun"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        queued = self.queued

        run = self.run.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "queued": queued,
                "run": run,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integration_sync_response_run import IntegrationSyncResponseRun

        d = src_dict.copy()
        org_id = d.pop("org_id")

        queued = d.pop("queued")

        run = IntegrationSyncResponseRun.from_dict(d.pop("run"))

        request_id = d.pop("request_id")

        integration_sync_response = cls(
            org_id=org_id,
            queued=queued,
            run=run,
            request_id=request_id,
        )

        return integration_sync_response
