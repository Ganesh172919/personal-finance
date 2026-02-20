from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="Pagination")


@_attrs_define
class Pagination:
    """
    Attributes:
        page (int):
        limit (int):
        total (int):
        total_pages (int):
    """

    page: int
    limit: int
    total: int
    total_pages: int

    def to_dict(self) -> dict[str, Any]:
        page = self.page

        limit = self.limit

        total = self.total

        total_pages = self.total_pages

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "page": page,
                "limit": limit,
                "total": total,
                "totalPages": total_pages,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        page = d.pop("page")

        limit = d.pop("limit")

        total = d.pop("total")

        total_pages = d.pop("totalPages")

        pagination = cls(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        )

        return pagination
