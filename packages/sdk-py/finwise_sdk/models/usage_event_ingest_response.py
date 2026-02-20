from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="UsageEventIngestResponse")


@_attrs_define
class UsageEventIngestResponse:
    """
    Attributes:
        accepted (bool):
        request_id (str):
    """

    accepted: bool
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        accepted = self.accepted

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "accepted": accepted,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        accepted = d.pop("accepted")

        request_id = d.pop("request_id")

        usage_event_ingest_response = cls(
            accepted=accepted,
            request_id=request_id,
        )

        return usage_event_ingest_response
