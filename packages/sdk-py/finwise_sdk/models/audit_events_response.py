from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.audit_event import AuditEvent


T = TypeVar("T", bound="AuditEventsResponse")


@_attrs_define
class AuditEventsResponse:
    """
    Attributes:
        events (list['AuditEvent']):
        request_id (str):
    """

    events: list["AuditEvent"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        events = []
        for events_item_data in self.events:
            events_item = events_item_data.to_dict()
            events.append(events_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "events": events,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.audit_event import AuditEvent

        d = src_dict.copy()
        events = []
        _events = d.pop("events")
        for events_item_data in _events:
            events_item = AuditEvent.from_dict(events_item_data)

            events.append(events_item)

        request_id = d.pop("request_id")

        audit_events_response = cls(
            events=events,
            request_id=request_id,
        )

        return audit_events_response
