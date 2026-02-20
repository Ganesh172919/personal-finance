import json
from io import BytesIO
from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, File, Unset

if TYPE_CHECKING:
    from ..models.transactions_csv_import_request_mapping import (
        TransactionsCsvImportRequestMapping,
    )


T = TypeVar("T", bound="TransactionsCsvImportRequest")


@_attrs_define
class TransactionsCsvImportRequest:
    """
    Attributes:
        file (File):
        mapping (TransactionsCsvImportRequestMapping):
        account_id (Union[Unset, str]):
        dry_run (Union[Unset, bool]):
    """

    file: File
    mapping: "TransactionsCsvImportRequestMapping"
    account_id: Union[Unset, str] = UNSET
    dry_run: Union[Unset, bool] = UNSET

    def to_dict(self) -> dict[str, Any]:
        file = self.file.to_tuple()

        mapping = self.mapping.to_dict()

        account_id = self.account_id

        dry_run = self.dry_run

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "file": file,
                "mapping": mapping,
            }
        )
        if account_id is not UNSET:
            field_dict["account_id"] = account_id
        if dry_run is not UNSET:
            field_dict["dry_run"] = dry_run

        return field_dict

    def to_multipart(self) -> dict[str, Any]:
        file = self.file.to_tuple()

        mapping = (
            None,
            json.dumps(self.mapping.to_dict()).encode(),
            "application/json",
        )

        account_id = (
            self.account_id
            if isinstance(self.account_id, Unset)
            else (None, str(self.account_id).encode(), "text/plain")
        )

        dry_run = (
            self.dry_run
            if isinstance(self.dry_run, Unset)
            else (None, str(self.dry_run).encode(), "text/plain")
        )

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "file": file,
                "mapping": mapping,
            }
        )
        if account_id is not UNSET:
            field_dict["account_id"] = account_id
        if dry_run is not UNSET:
            field_dict["dry_run"] = dry_run

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.transactions_csv_import_request_mapping import (
            TransactionsCsvImportRequestMapping,
        )

        d = src_dict.copy()
        file = File(payload=BytesIO(d.pop("file")))

        mapping = TransactionsCsvImportRequestMapping.from_dict(d.pop("mapping"))

        account_id = d.pop("account_id", UNSET)

        dry_run = d.pop("dry_run", UNSET)

        transactions_csv_import_request = cls(
            file=file,
            mapping=mapping,
            account_id=account_id,
            dry_run=dry_run,
        )

        return transactions_csv_import_request
