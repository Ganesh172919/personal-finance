from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="TransactionsCsvImportRequestMapping")


@_attrs_define
class TransactionsCsvImportRequestMapping:
    """
    Attributes:
        amount (str):
        date (str):
        description (Union[Unset, str]):
        category (Union[Unset, str]):
        type_ (Union[Unset, str]):
        merchant (Union[Unset, str]):
    """

    amount: str
    date: str
    description: Union[Unset, str] = UNSET
    category: Union[Unset, str] = UNSET
    type_: Union[Unset, str] = UNSET
    merchant: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        amount = self.amount

        date = self.date

        description = self.description

        category = self.category

        type_ = self.type_

        merchant = self.merchant

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "amount": amount,
                "date": date,
            }
        )
        if description is not UNSET:
            field_dict["description"] = description
        if category is not UNSET:
            field_dict["category"] = category
        if type_ is not UNSET:
            field_dict["type"] = type_
        if merchant is not UNSET:
            field_dict["merchant"] = merchant

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        amount = d.pop("amount")

        date = d.pop("date")

        description = d.pop("description", UNSET)

        category = d.pop("category", UNSET)

        type_ = d.pop("type", UNSET)

        merchant = d.pop("merchant", UNSET)

        transactions_csv_import_request_mapping = cls(
            amount=amount,
            date=date,
            description=description,
            category=category,
            type_=type_,
            merchant=merchant,
        )

        return transactions_csv_import_request_mapping
