import datetime
from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.create_transaction_body_type import CreateTransactionBodyType
from ..types import UNSET, Unset

T = TypeVar("T", bound="CreateTransactionBody")


@_attrs_define
class CreateTransactionBody:
    """
    Attributes:
        amount (float):
        category (str):
        description (str):
        type_ (CreateTransactionBodyType):
        date (Union[Unset, datetime.datetime]):
    """

    amount: float
    category: str
    description: str
    type_: CreateTransactionBodyType
    date: Union[Unset, datetime.datetime] = UNSET

    def to_dict(self) -> dict[str, Any]:
        amount = self.amount

        category = self.category

        description = self.description

        type_ = self.type_.value

        date: Union[Unset, str] = UNSET
        if not isinstance(self.date, Unset):
            date = self.date.isoformat()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "amount": amount,
                "category": category,
                "description": description,
                "type": type_,
            }
        )
        if date is not UNSET:
            field_dict["date"] = date

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        amount = d.pop("amount")

        category = d.pop("category")

        description = d.pop("description")

        type_ = CreateTransactionBodyType(d.pop("type"))

        _date = d.pop("date", UNSET)
        date: Union[Unset, datetime.datetime]
        if isinstance(_date, Unset):
            date = UNSET
        else:
            date = isoparse(_date)

        create_transaction_body = cls(
            amount=amount,
            category=category,
            description=description,
            type_=type_,
            date=date,
        )

        return create_transaction_body
