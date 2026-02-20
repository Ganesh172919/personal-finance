import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.recurring_candidate_cadence import RecurringCandidateCadence

if TYPE_CHECKING:
    from ..models.recurring_rule_suggestion import RecurringRuleSuggestion


T = TypeVar("T", bound="RecurringCandidate")


@_attrs_define
class RecurringCandidate:
    """
    Attributes:
        candidate_id (str):
        cadence (RecurringCandidateCadence):
        confidence (float):
        occurrences (int):
        first_seen_at (datetime.datetime):
        last_seen_at (datetime.datetime):
        interval_days_median (int):
        amount_avg (float):
        amount_min (float):
        amount_max (float):
        amount_range_pct (float):
        category (str):
        merchant_id (Union[None, str]):
        merchant_name (Union[None, str]):
        description_sample (str):
        suggested_cron (str):
        suggested_rule (RecurringRuleSuggestion):
        rationale (list[str]):
    """

    candidate_id: str
    cadence: RecurringCandidateCadence
    confidence: float
    occurrences: int
    first_seen_at: datetime.datetime
    last_seen_at: datetime.datetime
    interval_days_median: int
    amount_avg: float
    amount_min: float
    amount_max: float
    amount_range_pct: float
    category: str
    merchant_id: Union[None, str]
    merchant_name: Union[None, str]
    description_sample: str
    suggested_cron: str
    suggested_rule: "RecurringRuleSuggestion"
    rationale: list[str]

    def to_dict(self) -> dict[str, Any]:
        candidate_id = self.candidate_id

        cadence = self.cadence.value

        confidence = self.confidence

        occurrences = self.occurrences

        first_seen_at = self.first_seen_at.isoformat()

        last_seen_at = self.last_seen_at.isoformat()

        interval_days_median = self.interval_days_median

        amount_avg = self.amount_avg

        amount_min = self.amount_min

        amount_max = self.amount_max

        amount_range_pct = self.amount_range_pct

        category = self.category

        merchant_id: Union[None, str]
        merchant_id = self.merchant_id

        merchant_name: Union[None, str]
        merchant_name = self.merchant_name

        description_sample = self.description_sample

        suggested_cron = self.suggested_cron

        suggested_rule = self.suggested_rule.to_dict()

        rationale = self.rationale

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "candidate_id": candidate_id,
                "cadence": cadence,
                "confidence": confidence,
                "occurrences": occurrences,
                "first_seen_at": first_seen_at,
                "last_seen_at": last_seen_at,
                "interval_days_median": interval_days_median,
                "amount_avg": amount_avg,
                "amount_min": amount_min,
                "amount_max": amount_max,
                "amount_range_pct": amount_range_pct,
                "category": category,
                "merchant_id": merchant_id,
                "merchant_name": merchant_name,
                "description_sample": description_sample,
                "suggested_cron": suggested_cron,
                "suggested_rule": suggested_rule,
                "rationale": rationale,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.recurring_rule_suggestion import RecurringRuleSuggestion

        d = src_dict.copy()
        candidate_id = d.pop("candidate_id")

        cadence = RecurringCandidateCadence(d.pop("cadence"))

        confidence = d.pop("confidence")

        occurrences = d.pop("occurrences")

        first_seen_at = isoparse(d.pop("first_seen_at"))

        last_seen_at = isoparse(d.pop("last_seen_at"))

        interval_days_median = d.pop("interval_days_median")

        amount_avg = d.pop("amount_avg")

        amount_min = d.pop("amount_min")

        amount_max = d.pop("amount_max")

        amount_range_pct = d.pop("amount_range_pct")

        category = d.pop("category")

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

        description_sample = d.pop("description_sample")

        suggested_cron = d.pop("suggested_cron")

        suggested_rule = RecurringRuleSuggestion.from_dict(d.pop("suggested_rule"))

        rationale = cast(list[str], d.pop("rationale"))

        recurring_candidate = cls(
            candidate_id=candidate_id,
            cadence=cadence,
            confidence=confidence,
            occurrences=occurrences,
            first_seen_at=first_seen_at,
            last_seen_at=last_seen_at,
            interval_days_median=interval_days_median,
            amount_avg=amount_avg,
            amount_min=amount_min,
            amount_max=amount_max,
            amount_range_pct=amount_range_pct,
            category=category,
            merchant_id=merchant_id,
            merchant_name=merchant_name,
            description_sample=description_sample,
            suggested_cron=suggested_cron,
            suggested_rule=suggested_rule,
            rationale=rationale,
        )

        return recurring_candidate
