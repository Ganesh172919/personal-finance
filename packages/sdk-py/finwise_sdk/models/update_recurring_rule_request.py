import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.recurring_rule_status import RecurringRuleStatus
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.update_recurring_rule_request_metadata import (
        UpdateRecurringRuleRequestMetadata,
    )


T = TypeVar("T", bound="UpdateRecurringRuleRequest")


@_attrs_define
class UpdateRecurringRuleRequest:
    """
    Attributes:
        name (Union[Unset, str]):
        cron (Union[Unset, str]):
        status (Union[Unset, RecurringRuleStatus]):
        merchant_id (Union[None, Unset, str]):
        merchant_name (Union[None, Unset, str]):
        category (Union[None, Unset, str]):
        amount_min (Union[None, Unset, float]):
        amount_max (Union[None, Unset, float]):
        next_run_at (Union[None, Unset, datetime.datetime]):
        metadata (Union[Unset, UpdateRecurringRuleRequestMetadata]):
    """

    name: Union[Unset, str] = UNSET
    cron: Union[Unset, str] = UNSET
    status: Union[Unset, RecurringRuleStatus] = UNSET
    merchant_id: Union[None, Unset, str] = UNSET
    merchant_name: Union[None, Unset, str] = UNSET
    category: Union[None, Unset, str] = UNSET
    amount_min: Union[None, Unset, float] = UNSET
    amount_max: Union[None, Unset, float] = UNSET
    next_run_at: Union[None, Unset, datetime.datetime] = UNSET
    metadata: Union[Unset, "UpdateRecurringRuleRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        cron = self.cron

        status: Union[Unset, str] = UNSET
        if not isinstance(self.status, Unset):
            status = self.status.value

        merchant_id: Union[None, Unset, str]
        if isinstance(self.merchant_id, Unset):
            merchant_id = UNSET
        else:
            merchant_id = self.merchant_id

        merchant_name: Union[None, Unset, str]
        if isinstance(self.merchant_name, Unset):
            merchant_name = UNSET
        else:
            merchant_name = self.merchant_name

        category: Union[None, Unset, str]
        if isinstance(self.category, Unset):
            category = UNSET
        else:
            category = self.category

        amount_min: Union[None, Unset, float]
        if isinstance(self.amount_min, Unset):
            amount_min = UNSET
        else:
            amount_min = self.amount_min

        amount_max: Union[None, Unset, float]
        if isinstance(self.amount_max, Unset):
            amount_max = UNSET
        else:
            amount_max = self.amount_max

        next_run_at: Union[None, Unset, str]
        if isinstance(self.next_run_at, Unset):
            next_run_at = UNSET
        elif isinstance(self.next_run_at, datetime.datetime):
            next_run_at = self.next_run_at.isoformat()
        else:
            next_run_at = self.next_run_at

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if name is not UNSET:
            field_dict["name"] = name
        if cron is not UNSET:
            field_dict["cron"] = cron
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
        from ..models.update_recurring_rule_request_metadata import (
            UpdateRecurringRuleRequestMetadata,
        )

        d = src_dict.copy()
        name = d.pop("name", UNSET)

        cron = d.pop("cron", UNSET)

        _status = d.pop("status", UNSET)
        status: Union[Unset, RecurringRuleStatus]
        if isinstance(_status, Unset):
            status = UNSET
        else:
            status = RecurringRuleStatus(_status)

        def _parse_merchant_id(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        merchant_id = _parse_merchant_id(d.pop("merchant_id", UNSET))

        def _parse_merchant_name(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        merchant_name = _parse_merchant_name(d.pop("merchant_name", UNSET))

        def _parse_category(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        category = _parse_category(d.pop("category", UNSET))

        def _parse_amount_min(data: object) -> Union[None, Unset, float]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, float], data)

        amount_min = _parse_amount_min(d.pop("amount_min", UNSET))

        def _parse_amount_max(data: object) -> Union[None, Unset, float]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, float], data)

        amount_max = _parse_amount_max(d.pop("amount_max", UNSET))

        def _parse_next_run_at(data: object) -> Union[None, Unset, datetime.datetime]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                next_run_at_type_1 = isoparse(data)

                return next_run_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, Unset, datetime.datetime], data)

        next_run_at = _parse_next_run_at(d.pop("next_run_at", UNSET))

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, UpdateRecurringRuleRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = UpdateRecurringRuleRequestMetadata.from_dict(_metadata)

        update_recurring_rule_request = cls(
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

        return update_recurring_rule_request
