from typing import Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

T = TypeVar("T", bound="TransactionsCsvImportResponse")


@_attrs_define
class TransactionsCsvImportResponse:
    """
    Attributes:
        org_id (str):
        ok (bool):
        file_name (str):
        parsed_rows (int):
        valid_rows (int):
        inserted (int):
        duplicates (int):
        merchants_touched (int):
        dry_run (bool):
        request_id (str):
        import_id (Union[Unset, str]):
    """

    org_id: str
    ok: bool
    file_name: str
    parsed_rows: int
    valid_rows: int
    inserted: int
    duplicates: int
    merchants_touched: int
    dry_run: bool
    request_id: str
    import_id: Union[Unset, str] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        ok = self.ok

        file_name = self.file_name

        parsed_rows = self.parsed_rows

        valid_rows = self.valid_rows

        inserted = self.inserted

        duplicates = self.duplicates

        merchants_touched = self.merchants_touched

        dry_run = self.dry_run

        request_id = self.request_id

        import_id = self.import_id

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "org_id": org_id,
                "ok": ok,
                "file_name": file_name,
                "parsed_rows": parsed_rows,
                "valid_rows": valid_rows,
                "inserted": inserted,
                "duplicates": duplicates,
                "merchants_touched": merchants_touched,
                "dry_run": dry_run,
                "request_id": request_id,
            }
        )
        if import_id is not UNSET:
            field_dict["import_id"] = import_id

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        org_id = d.pop("org_id")

        ok = d.pop("ok")

        file_name = d.pop("file_name")

        parsed_rows = d.pop("parsed_rows")

        valid_rows = d.pop("valid_rows")

        inserted = d.pop("inserted")

        duplicates = d.pop("duplicates")

        merchants_touched = d.pop("merchants_touched")

        dry_run = d.pop("dry_run")

        request_id = d.pop("request_id")

        import_id = d.pop("import_id", UNSET)

        transactions_csv_import_response = cls(
            org_id=org_id,
            ok=ok,
            file_name=file_name,
            parsed_rows=parsed_rows,
            valid_rows=valid_rows,
            inserted=inserted,
            duplicates=duplicates,
            merchants_touched=merchants_touched,
            dry_run=dry_run,
            request_id=request_id,
            import_id=import_id,
        )

        transactions_csv_import_response.additional_properties = d
        return transactions_csv_import_response

    @property
    def additional_keys(self) -> list[str]:
        return list(self.additional_properties.keys())

    def __getitem__(self, key: str) -> Any:
        return self.additional_properties[key]

    def __setitem__(self, key: str, value: Any) -> None:
        self.additional_properties[key] = value

    def __delitem__(self, key: str) -> None:
        del self.additional_properties[key]

    def __contains__(self, key: str) -> bool:
        return key in self.additional_properties
