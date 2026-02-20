from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..models.create_transactions_csv_export_request_type import (
    CreateTransactionsCsvExportRequestType,
)
from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.transactions_csv_export_params import TransactionsCsvExportParams


T = TypeVar("T", bound="CreateTransactionsCsvExportRequest")


@_attrs_define
class CreateTransactionsCsvExportRequest:
    """
    Attributes:
        type_ (CreateTransactionsCsvExportRequestType):
        params (Union[Unset, TransactionsCsvExportParams]):
        idempotency_key (Union[Unset, str]):
    """

    type_: CreateTransactionsCsvExportRequestType
    params: Union[Unset, "TransactionsCsvExportParams"] = UNSET
    idempotency_key: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        type_ = self.type_.value

        params: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.params, Unset):
            params = self.params.to_dict()

        idempotency_key = self.idempotency_key

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "type": type_,
            }
        )
        if params is not UNSET:
            field_dict["params"] = params
        if idempotency_key is not UNSET:
            field_dict["idempotency_key"] = idempotency_key

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.transactions_csv_export_params import TransactionsCsvExportParams

        d = src_dict.copy()
        type_ = CreateTransactionsCsvExportRequestType(d.pop("type"))

        _params = d.pop("params", UNSET)
        params: Union[Unset, TransactionsCsvExportParams]
        if isinstance(_params, Unset):
            params = UNSET
        else:
            params = TransactionsCsvExportParams.from_dict(_params)

        idempotency_key = d.pop("idempotency_key", UNSET)

        create_transactions_csv_export_request = cls(
            type_=type_,
            params=params,
            idempotency_key=idempotency_key,
        )

        return create_transactions_csv_export_request
