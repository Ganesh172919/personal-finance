from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.import_transactions_body_rows_item import (
        ImportTransactionsBodyRowsItem,
    )


T = TypeVar("T", bound="ImportTransactionsBody")


@_attrs_define
class ImportTransactionsBody:
    """
    Attributes:
        rows (list['ImportTransactionsBodyRowsItem']):
    """

    rows: list["ImportTransactionsBodyRowsItem"]

    def to_dict(self) -> dict[str, Any]:
        rows = []
        for rows_item_data in self.rows:
            rows_item = rows_item_data.to_dict()
            rows.append(rows_item)

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "rows": rows,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.import_transactions_body_rows_item import (
            ImportTransactionsBodyRowsItem,
        )

        d = src_dict.copy()
        rows = []
        _rows = d.pop("rows")
        for rows_item_data in _rows:
            rows_item = ImportTransactionsBodyRowsItem.from_dict(rows_item_data)

            rows.append(rows_item)

        import_transactions_body = cls(
            rows=rows,
        )

        return import_transactions_body
