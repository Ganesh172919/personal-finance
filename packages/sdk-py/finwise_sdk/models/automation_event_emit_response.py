from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AutomationEventEmitResponse")


@_attrs_define
class AutomationEventEmitResponse:
    """
    Attributes:
        accepted (bool):
        org_id (str):
        event_type (str):
        aggregate_type (str):
        aggregate_id (str):
        request_id (str):
    """

    accepted: bool
    org_id: str
    event_type: str
    aggregate_type: str
    aggregate_id: str
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        accepted = self.accepted

        org_id = self.org_id

        event_type = self.event_type

        aggregate_type = self.aggregate_type

        aggregate_id = self.aggregate_id

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "accepted": accepted,
                "org_id": org_id,
                "event_type": event_type,
                "aggregate_type": aggregate_type,
                "aggregate_id": aggregate_id,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        accepted = d.pop("accepted")

        org_id = d.pop("org_id")

        event_type = d.pop("event_type")

        aggregate_type = d.pop("aggregate_type")

        aggregate_id = d.pop("aggregate_id")

        request_id = d.pop("request_id")

        automation_event_emit_response = cls(
            accepted=accepted,
            org_id=org_id,
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            request_id=request_id,
        )

        return automation_event_emit_response
