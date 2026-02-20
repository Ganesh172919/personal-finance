from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.usage_feature import UsageFeature
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.usage_event_request_context import UsageEventRequestContext


T = TypeVar("T", bound="UsageEventRequest")


@_attrs_define
class UsageEventRequest:
    """
    Attributes:
        user_id (str):
        feature (UsageFeature):
        units (float):
        org_id (Union[Unset, str]):
        idempotency_key (Union[Unset, str]):
        context (Union[Unset, UsageEventRequestContext]):
    """

    user_id: str
    feature: UsageFeature
    units: float
    org_id: Union[Unset, str] = UNSET
    idempotency_key: Union[Unset, str] = UNSET
    context: Union[Unset, "UsageEventRequestContext"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        user_id = self.user_id

        feature = self.feature.value

        units = self.units

        org_id = self.org_id

        idempotency_key = self.idempotency_key

        context: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.context, Unset):
            context = self.context.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "user_id": user_id,
                "feature": feature,
                "units": units,
            }
        )
        if org_id is not UNSET:
            field_dict["org_id"] = org_id
        if idempotency_key is not UNSET:
            field_dict["idempotency_key"] = idempotency_key
        if context is not UNSET:
            field_dict["context"] = context

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.usage_event_request_context import UsageEventRequestContext

        d = src_dict.copy()
        user_id = d.pop("user_id")

        feature = UsageFeature(d.pop("feature"))

        units = d.pop("units")

        org_id = d.pop("org_id", UNSET)

        idempotency_key = d.pop("idempotency_key", UNSET)

        _context = d.pop("context", UNSET)
        context: Union[Unset, UsageEventRequestContext]
        if isinstance(_context, Unset):
            context = UNSET
        else:
            context = UsageEventRequestContext.from_dict(_context)

        usage_event_request = cls(
            user_id=user_id,
            feature=feature,
            units=units,
            org_id=org_id,
            idempotency_key=idempotency_key,
            context=context,
        )

        return usage_event_request
