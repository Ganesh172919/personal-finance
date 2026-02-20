import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.financial_story_share_payload_type import FinancialStorySharePayloadType
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.financial_story_share_payload_goals_item import (
        FinancialStorySharePayloadGoalsItem,
    )
    from ..models.financial_story_share_payload_milestones_item import (
        FinancialStorySharePayloadMilestonesItem,
    )
    from ..models.financial_story_share_payload_summary import (
        FinancialStorySharePayloadSummary,
    )


T = TypeVar("T", bound="FinancialStorySharePayload")


@_attrs_define
class FinancialStorySharePayload:
    """
    Attributes:
        type_ (FinancialStorySharePayloadType):
        generated_at (datetime.datetime):
        summary (FinancialStorySharePayloadSummary):
        goals (list['FinancialStorySharePayloadGoalsItem']):
        milestones (list['FinancialStorySharePayloadMilestonesItem']):
        currency (Union[None, Unset, str]):
        locale (Union[None, Unset, str]):
        timezone (Union[None, Unset, str]):
        profile_updated_at (Union[None, Unset, datetime.datetime]):
    """

    type_: FinancialStorySharePayloadType
    generated_at: datetime.datetime
    summary: "FinancialStorySharePayloadSummary"
    goals: list["FinancialStorySharePayloadGoalsItem"]
    milestones: list["FinancialStorySharePayloadMilestonesItem"]
    currency: Union[None, Unset, str] = UNSET
    locale: Union[None, Unset, str] = UNSET
    timezone: Union[None, Unset, str] = UNSET
    profile_updated_at: Union[None, Unset, datetime.datetime] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        generated_at = self.generated_at.isoformat()

        summary = self.summary.to_dict()

        goals = []
        for goals_item_data in self.goals:
            goals_item = goals_item_data.to_dict()
            goals.append(goals_item)

        milestones = []
        for milestones_item_data in self.milestones:
            milestones_item = milestones_item_data.to_dict()
            milestones.append(milestones_item)

        currency: Union[None, Unset, str]
        if isinstance(self.currency, Unset):
            currency = UNSET
        else:
            currency = self.currency

        locale: Union[None, Unset, str]
        if isinstance(self.locale, Unset):
            locale = UNSET
        else:
            locale = self.locale

        timezone: Union[None, Unset, str]
        if isinstance(self.timezone, Unset):
            timezone = UNSET
        else:
            timezone = self.timezone

        profile_updated_at: Union[None, Unset, str]
        if isinstance(self.profile_updated_at, Unset):
            profile_updated_at = UNSET
        elif isinstance(self.profile_updated_at, datetime.datetime):
            profile_updated_at = self.profile_updated_at.isoformat()
        else:
            profile_updated_at = self.profile_updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
                "generated_at": generated_at,
                "summary": summary,
                "goals": goals,
                "milestones": milestones,
            }
        )
        if currency is not UNSET:
            field_dict["currency"] = currency
        if locale is not UNSET:
            field_dict["locale"] = locale
        if timezone is not UNSET:
            field_dict["timezone"] = timezone
        if profile_updated_at is not UNSET:
            field_dict["profile_updated_at"] = profile_updated_at

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.financial_story_share_payload_goals_item import (
            FinancialStorySharePayloadGoalsItem,
        )
        from ..models.financial_story_share_payload_milestones_item import (
            FinancialStorySharePayloadMilestonesItem,
        )
        from ..models.financial_story_share_payload_summary import (
            FinancialStorySharePayloadSummary,
        )

        d = src_dict.copy()
        type_ = FinancialStorySharePayloadType(d.pop("type"))

        generated_at = isoparse(d.pop("generated_at"))

        summary = FinancialStorySharePayloadSummary.from_dict(d.pop("summary"))

        goals = []
        _goals = d.pop("goals")
        for goals_item_data in _goals:
            goals_item = FinancialStorySharePayloadGoalsItem.from_dict(goals_item_data)

            goals.append(goals_item)

        milestones = []
        _milestones = d.pop("milestones")
        for milestones_item_data in _milestones:
            milestones_item = FinancialStorySharePayloadMilestonesItem.from_dict(
                milestones_item_data
            )

            milestones.append(milestones_item)

        def _parse_currency(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        currency = _parse_currency(d.pop("currency", UNSET))

        def _parse_locale(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        locale = _parse_locale(d.pop("locale", UNSET))

        def _parse_timezone(data: object) -> Union[None, Unset, str]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            return cast(Union[None, Unset, str], data)

        timezone = _parse_timezone(d.pop("timezone", UNSET))

        def _parse_profile_updated_at(
            data: object,
        ) -> Union[None, Unset, datetime.datetime]:
            if data is None:
                return data
            if isinstance(data, Unset):
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                profile_updated_at_type_1 = isoparse(data)

                return profile_updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, Unset, datetime.datetime], data)

        profile_updated_at = _parse_profile_updated_at(
            d.pop("profile_updated_at", UNSET)
        )

        financial_story_share_payload = cls(
            type_=type_,
            generated_at=generated_at,
            summary=summary,
            goals=goals,
            milestones=milestones,
            currency=currency,
            locale=locale,
            timezone=timezone,
            profile_updated_at=profile_updated_at,
        )

        return financial_story_share_payload
