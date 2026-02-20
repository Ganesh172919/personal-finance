import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.recurring_rule_status import RecurringRuleStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.create_recurring_rule_request_metadata import (
        CreateRecurringRuleRequestMetadata,
    )


T = TypeVar("T", bound="CreateRecurringRuleRequest")


@_attrs_define
class CreateRecurringRuleRequest:
    """
    Attributes:
        name (str):
        cron (str):
        status (Union[Unset, RecurringRuleStatus]):
        merchant_id (Union[Unset, str]):
        merchant_name (Union[Unset, str]):
        category (Union[Unset, str]):
        amount_min (Union[Unset, float]):
        amount_max (Union[Unset, float]):
        next_run_at (Union[Unset, datetime.datetime]):
        metadata (Union[Unset, CreateRecurringRuleRequestMetadata]):
    """

    name: str
    cron: str
    status: Union[Unset, RecurringRuleStatus] = UNSET
    merchant_id: Union[Unset, str] = UNSET
    merchant_name: Union[Unset, str] = UNSET
    category: Union[Unset, str] = UNSET
    amount_min: Union[Unset, float] = UNSET
    amount_max: Union[Unset, float] = UNSET
    next_run_at: Union[Unset, datetime.datetime] = UNSET
    metadata: Union[Unset, "CreateRecurringRuleRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        cron = self.cron

        status: Union[Unset, str] = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        merchant_id = self.merchant_id

        merchant_name = self.merchant_name

        category = self.category

        amount_min = self.amount_min

        amount_max = self.amount_max

        next_run_at: Union[Unset, str] = UNSET
        if not isinstance(self.next_run_at, Unset):
            next_run_at = self.next_run_at.isoformat()

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
                "cron": cron,
            }
        )
        if status is not UNSET:
            field_dict["status"] = status
        if merchant_id is not UNSET:
            field_dict["merchant_id"] = merchant_id
        if merchant_name is not UNSET:
            field_dict["merchant_name"] = merchant_name
        if category is not UNSET:
            field_dict["category"] = category
        if amount_min is not UNSET:
            field_dict["amount_min"] = amount_min
        if amount_max is not UNSET:
            field_dict["amount_max"] = amount_max
        if next_run_at is not UNSET:
            field_dict["next_run_at"] = next_run_at
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_recurring_rule_request_metadata import (
            CreateRecurringRuleRequestMetadata,
        )

        d = src_dict.copy()
        name = d.pop("name")

        cron = d.pop("cron")

        _status = d.pop("status", UNSET)
        status: Union[Unset, RecurringRuleStatus]
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = RecurringRuleStatus(_status)

        merchant_id = d.pop("merchant_id", UNSET)

        merchant_name = d.pop("merchant_name", UNSET)

        category = d.pop("category", UNSET)

        amount_min = d.pop("amount_min", UNSET)

        amount_max = d.pop("amount_max", UNSET)

        _next_run_at = d.pop("next_run_at", UNSET)
        next_run_at: Union[Unset, datetime.datetime]
        if isinstance(_next_run_at, Unset):
            next_run_at = UNSET
        else:
            next_run_at = isoparse(_next_run_at)

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, CreateRecurringRuleRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = CreateRecurringRuleRequestMetadata.from_dict(_metadata)

        create_recurring_rule_request = cls(
            name=name,
            cron=cron,
            status=status,
            merchant_id=merchant_id,
            merchant_name=merchant_name,
            category=category,
            amount_min=amount_min,
            amount_max=amount_max,
            next_run_at=next_run_at,
            metadata=metadata,
        )

        return create_recurring_rule_request
