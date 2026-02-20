from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.budget_envelope_row import BudgetEnvelopeRow
    from ..models.budget_envelopes_totals import BudgetEnvelopesTotals


T = TypeVar("T", bound="BudgetEnvelopesResponse")


@_attrs_define
class BudgetEnvelopesResponse:
    """
    Attributes:
        org_id (str):
        period_key (str):
        currency (str):
        totals (BudgetEnvelopesTotals):
        envelopes (list['BudgetEnvelopeRow']):
        request_id (str):
    """

    org_id: str
    period_key: str
    currency: str
    totals: "BudgetEnvelopesTotals"
    envelopes: list["BudgetEnvelopeRow"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        period_key = self.period_key

        currency = self.currency

        totals = self.totals.to_dict()

        envelopes = []
        for envelopes_item_data in self.envelopes:
            envelopes_item = envelopes_item_data.to_dict()
            envelopes.append(envelopes_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "period_key": period_key,
                "currency": currency,
                "totals": totals,
                "envelopes": envelopes,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.budget_envelope_row import BudgetEnvelopeRow
        from ..models.budget_envelopes_totals import BudgetEnvelopesTotals

        d = src_dict.copy()
        org_id = d.pop("org_id")

        period_key = d.pop("period_key")

        currency = d.pop("currency")

        totals = BudgetEnvelopesTotals.from_dict(d.pop("totals"))

        envelopes = []
        _envelopes = d.pop("envelopes")
        for envelopes_item_data in _envelopes:
            envelopes_item = BudgetEnvelopeRow.from_dict(envelopes_item_data)

            envelopes.append(envelopes_item)

        request_id = d.pop("request_id")

        budget_envelopes_response = cls(
            org_id=org_id,
            period_key=period_key,
            currency=currency,
            totals=totals,
            envelopes=envelopes,
            request_id=request_id,
        )

        return budget_envelopes_response
