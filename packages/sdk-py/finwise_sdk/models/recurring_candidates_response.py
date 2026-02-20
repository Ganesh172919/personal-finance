from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.recurring_candidate import RecurringCandidate


T = TypeVar("T", bound="RecurringCandidatesResponse")


@_attrs_define
class RecurringCandidatesResponse:
    """
    Attributes:
        org_id (str):
        days_back (int):
        candidates (list['RecurringCandidate']):
        request_id (str):
    """

    org_id: str
    days_back: int
    candidates: list["RecurringCandidate"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        days_back = self.days_back

        candidates = []
        for candidates_item_data in self.candidates:
            candidates_item = candidates_item_data.to_dict()
            candidates.append(candidates_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "days_back": days_back,
                "candidates": candidates,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.recurring_candidate import RecurringCandidate

        d = src_dict.copy()
        org_id = d.pop("org_id")

        days_back = d.pop("days_back")

        candidates = []
        _candidates = d.pop("candidates")
        for candidates_item_data in _candidates:
            candidates_item = RecurringCandidate.from_dict(candidates_item_data)

            candidates.append(candidates_item)

        request_id = d.pop("request_id")

        recurring_candidates_response = cls(
            org_id=org_id,
            days_back=days_back,
            candidates=candidates,
            request_id=request_id,
        )

        return recurring_candidates_response
