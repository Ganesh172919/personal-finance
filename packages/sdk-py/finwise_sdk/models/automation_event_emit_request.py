from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.automation_event_emit_request_payload import (
        AutomationEventEmitRequestPayload,
    )


T = TypeVar("T", bound="AutomationEventEmitRequest")


@_attrs_define
class AutomationEventEmitRequest:
    """
    Attributes:
        event_type (str):
        aggregate_type (Union[Unset, str]):
        aggregate_id (Union[Unset, str]):
        payload (Union[Unset, AutomationEventEmitRequestPayload]):
    """

    event_type: str
    aggregate_type: Union[Unset, str] = UNSET
    aggregate_id: Union[Unset, str] = UNSET
    payload: Union[Unset, "AutomationEventEmitRequestPayload"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        event_type = self.event_type

        aggregate_type = self.aggregate_type

        aggregate_id = self.aggregate_id

        payload: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.payload, Unset):
            payload = self.payload.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "event_type": event_type,
            }
        )
        if aggregate_type is not UNSET:
            field_dict["aggregate_type"] = aggregate_type
        if aggregate_id is not UNSET:
            field_dict["aggregate_id"] = aggregate_id
        if payload is not UNSET:
            field_dict["payload"] = payload

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.automation_event_emit_request_payload import (
            AutomationEventEmitRequestPayload,
        )

        d = src_dict.copy()
        event_type = d.pop("event_type")

        aggregate_type = d.pop("aggregate_type", UNSET)

        aggregate_id = d.pop("aggregate_id", UNSET)

        _payload = d.pop("payload", UNSET)
        payload: Union[Unset, AutomationEventEmitRequestPayload]
        if isinstance(_payload, Unset):
            payload = UNSET
        else:
            payload = AutomationEventEmitRequestPayload.from_dict(_payload)

        automation_event_emit_request = cls(
            event_type=event_type,
            aggregate_type=aggregate_type,
            aggregate_id=aggregate_id,
            payload=payload,
        )

        return automation_event_emit_request
