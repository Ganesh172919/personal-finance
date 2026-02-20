import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.recurring_rule_status import RecurringRuleStatus

if TYPE_CHECKING:
    from ..models.recurring_rule_metadata import RecurringRuleMetadata


T = TypeVar("T", bound="RecurringRule")


@_attrs_define
class RecurringRule:
    """
    Attributes:
        id (str):
        status (RecurringRuleStatus):
        name (str):
        cron (str):
        merchant_id (Union[None, str]):
        merchant_name (Union[None, str]):
        category (Union[None, str]):
        amount_min (Union[None, float]):
        amount_max (Union[None, float]):
        next_run_at (Union[None, datetime.datetime]):
        metadata (RecurringRuleMetadata):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    id: str
    status: RecurringRuleStatus
    name: str
    cron: str
    merchant_id: Union[None, str]
    merchant_name: Union[None, str]
    category: Union[None, str]
    amount_min: Union[None, float]
    amount_max: Union[None, float]
    next_run_at: Union[None, datetime.datetime]
    metadata: "RecurringRuleMetadata"
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        status = self.status.value

        name = self.name

        cron = self.cron

        merchant_id: Union[None, str]
        merchant_id = self.merchant_id

        merchant_name: Union[None, str]
        merchant_name = self.merchant_name

        category: Union[None, str]
        category = self.category

        amount_min: Union[None, float]
        amount_min = self.amount_min

        amount_max: Union[None, float]
        amount_max = self.amount_max

        next_run_at: Union[None, str]
        if isinstance(self.next_run_at, datetime.datetime):
            next_run_at = self.next_run_at.isoformat()
        else:
            next_run_at = self.next_run_at

        metadata = self.metadata.to_dict()

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "status": status,
                "name": name,
                "cron": cron,
                "merchant_id": merchant_id,
                "merchant_name": merchant_name,
                "category": category,
                "amount_min": amount_min,
                "amount_max": amount_max,
                "next_run_at": next_run_at,
                "metadata": metadata,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.recurring_rule_metadata import RecurringRuleMetadata

        d = src_dict.copy()
        id = d.pop("id")

        status = RecurringRuleStatus(d.pop("status"))

        name = d.pop("name")

        cron = d.pop("cron")

        def _parse_merchant_id(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        merchant_id = _parse_merchant_id(d.pop("merchant_id"))

        def _parse_merchant_name(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        merchant_name = _parse_merchant_name(d.pop("merchant_name"))

        def _parse_category(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        category = _parse_category(d.pop("category"))

        def _parse_amount_min(data: object) -> Union[None, float]:
            if data is None:
                return data
            return cast(Union[None, float], data)

        amount_min = _parse_amount_min(d.pop("amount_min"))

        def _parse_amount_max(data: object) -> Union[None, float]:
            if data is None:
                return data
            return cast(Union[None, float], data)

        amount_max = _parse_amount_max(d.pop("amount_max"))

        def _parse_next_run_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                next_run_at_type_1 = isoparse(data)

                return next_run_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        next_run_at = _parse_next_run_at(d.pop("next_run_at"))

        metadata = RecurringRuleMetadata.from_dict(d.pop("metadata"))

        def _parse_created_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_1 = isoparse(data)

                return created_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        created_at = _parse_created_at(d.pop("created_at"))

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        recurring_rule = cls(
            id=id,
            status=status,
            name=name,
            cron=cron,
            merchant_id=merchant_id,
            merchant_name=merchant_name,
            category=category,
            amount_min=amount_min,
            amount_max=amount_max,
            next_run_at=next_run_at,
            metadata=metadata,
            created_at=created_at,
            updated_at=updated_at,
        )

        return recurring_rule
