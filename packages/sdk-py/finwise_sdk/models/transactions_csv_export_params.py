from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.transaction_type import TransactionType
from ..types import UNSET, Unset

T = TypeVar("T", bound="TransactionsCsvExportParams")


@_attrs_define
class TransactionsCsvExportParams:
    """
    Attributes:
        date_from (Union[Unset, str]): ISO date or datetime string.
        date_to (Union[Unset, str]): ISO date or datetime string.
        tx_type (Union[Unset, TransactionType]):
        category (Union[Unset, str]):
    """

    date_from: Union[Unset, str] = UNSET
    date_to: Union[Unset, str] = UNSET
    tx_type: Union[Unset, TransactionType] = UNSET
    category: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        date_from = self.date_from

        date_to = self.date_to

        tx_type: Union[Unset, str] = UNSET
        if not isinstance(self.tx_type, Unset):
            tx_type = self.tx_type.value

        category = self.category

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if date_from is not UNSET:
            field_dict["date_from"] = date_from
        if date_to is not UNSET:
            field_dict["date_to"] = date_to
        if tx_type is not UNSET:
            field_dict["tx_type"] = tx_type
        if category is not UNSET:
            field_dict["category"] = category

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        date_from = d.pop("date_from", UNSET)

        date_to = d.pop("date_to", UNSET)

        _tx_type = d.pop("tx_type", UNSET)
        tx_type: Union[Unset, TransactionType]
        if isinstance(_tx_type, Unset):
            tx_type = UNSET
        else:
            tx_type = TransactionType(_tx_type)

        category = d.pop("category", UNSET)

        transactions_csv_export_params = cls(
            date_from=date_from,
            date_to=date_to,
            tx_type=tx_type,
            category=category,
        )

        return transactions_csv_export_params
