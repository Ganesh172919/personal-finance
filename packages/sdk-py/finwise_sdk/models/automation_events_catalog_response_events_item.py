from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AutomationEventsCatalogResponseEventsItem")


@_attrs_define
class AutomationEventsCatalogResponseEventsItem:
    """
    Attributes:
        event_type (str):
        title (str):
        source (str):
        description (str):
    """

    event_type: str
    title: str
    source: str
    description: str

    def to_dict(self) -> dict[str, Any]:
        event_type = self.event_type

        title = self.title

        source = self.source

        description = self.description

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "event_type": event_type,
                "title": title,
                "source": source,
                "description": description,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        event_type = d.pop("event_type")

        title = d.pop("title")

        source = d.pop("source")

        description = d.pop("description")

        automation_events_catalog_response_events_item = cls(
            event_type=event_type,
            title=title,
            source=source,
            description=description,
        )

        return automation_events_catalog_response_events_item
