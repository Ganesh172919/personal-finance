import datetime
from typing import Any, TypeVar

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="FinancialStorySharePayloadMilestonesItem")


@_attrs_define
class FinancialStorySharePayloadMilestonesItem:
    """
    Attributes:
        agent_type (str):
        title (str):
        description (str):
        timestamp (datetime.datetime):
    """

    agent_type: str
    title: str
    description: str
    timestamp: datetime.datetime

    def to_dict(self) -> dict[str, Any]:
        agent_type = self.agent_type

        title = self.title

        description = self.description

        timestamp = self.timestamp.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "agent_type": agent_type,
                "title": title,
                "description": description,
                "timestamp": timestamp,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        agent_type = d.pop("agent_type")

        title = d.pop("title")

        description = d.pop("description")

        timestamp = isoparse(d.pop("timestamp"))

        financial_story_share_payload_milestones_item = cls(
            agent_type=agent_type,
            title=title,
            description=description,
            timestamp=timestamp,
        )

        return financial_story_share_payload_milestones_item
