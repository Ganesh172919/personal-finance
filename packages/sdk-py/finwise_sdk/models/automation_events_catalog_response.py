from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.automation_events_catalog_response_events_item import (
        AutomationEventsCatalogResponseEventsItem,
    )


T = TypeVar("T", bound="AutomationEventsCatalogResponse")


@_attrs_define
class AutomationEventsCatalogResponse:
    """
    Attributes:
        org_id (str):
        events (list['AutomationEventsCatalogResponseEventsItem']):
        request_id (str):
    """

    org_id: str
    events: list["AutomationEventsCatalogResponseEventsItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        events = []
        for events_item_data in self.events:
            events_item = events_item_data.to_dict()
            events.append(events_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "events": events,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.automation_events_catalog_response_events_item import (
            AutomationEventsCatalogResponseEventsItem,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        events = []
        _events = d.pop("events")
        for events_item_data in _events:
            events_item = AutomationEventsCatalogResponseEventsItem.from_dict(
                events_item_data
            )

            events.append(events_item)

        request_id = d.pop("request_id")

        automation_events_catalog_response = cls(
            org_id=org_id,
            events=events,
            request_id=request_id,
        )

        return automation_events_catalog_response
