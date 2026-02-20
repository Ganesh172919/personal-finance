import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.audit_actor_type import AuditActorType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.audit_event_metadata import AuditEventMetadata


T = TypeVar("T", bound="AuditEvent")


@_attrs_define
class AuditEvent:
    """
    Attributes:
        id (str):
        actor_type (AuditActorType):
        action (str):
        target_type (str):
        metadata (AuditEventMetadata):
        created_at (datetime.datetime):
        actor_user_id (Union[Unset, str]):
        actor_api_key_id (Union[Unset, str]):
        target_id (Union[Unset, str]):
        request_id (Union[Unset, str]):
    """

    id: str
    actor_type: AuditActorType
    action: str
    target_type: str
    metadata: "AuditEventMetadata"
    created_at: datetime.datetime
    actor_user_id: Union[Unset, str] = UNSET
    actor_api_key_id: Union[Unset, str] = UNSET
    target_id: Union[Unset, str] = UNSET
    request_id: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        actor_type = self.actor_type.value

        action = self.action

        target_type = self.target_type

        metadata = self.metadata.to_dict()

        created_at = self.created_at.isoformat()

        actor_user_id = self.actor_user_id

        actor_api_key_id = self.actor_api_key_id

        target_id = self.target_id

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "actor_type": actor_type,
                "action": action,
                "target_type": target_type,
                "metadata": metadata,
                "created_at": created_at,
            }
        )
        if actor_user_id is not UNSET:
            field_dict["actor_user_id"] = actor_user_id
        if actor_api_key_id is not UNSET:
            field_dict["actor_api_key_id"] = actor_api_key_id
        if target_id is not UNSET:
            field_dict["target_id"] = target_id
        if request_id is not UNSET:
            field_dict["request_id"] = request_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.audit_event_metadata import AuditEventMetadata

        d = src_dict.copy()
        id = d.pop("id")

        actor_type = AuditActorType(d.pop("actor_type"))

        action = d.pop("action")

        target_type = d.pop("target_type")

        metadata = AuditEventMetadata.from_dict(d.pop("metadata"))

        created_at = isoparse(d.pop("created_at"))

        actor_user_id = d.pop("actor_user_id", UNSET)

        actor_api_key_id = d.pop("actor_api_key_id", UNSET)

        target_id = d.pop("target_id", UNSET)

        request_id = d.pop("request_id", UNSET)

        audit_event = cls(
            id=id,
            actor_type=actor_type,
            action=action,
            target_type=target_type,
            metadata=metadata,
            created_at=created_at,
            actor_user_id=actor_user_id,
            actor_api_key_id=actor_api_key_id,
            target_id=target_id,
            request_id=request_id,
        )

        return audit_event
