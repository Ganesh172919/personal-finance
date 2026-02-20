from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="CreateOrgRequest")


@_attrs_define
class CreateOrgRequest:
    """
    Attributes:
        name (str):
        slug (Union[Unset, str]):
    """

    name: str
    slug: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        name = self.name

        slug = self.slug

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "name": name,
            }
        )
        if slug is not UNSET:
            field_dict["slug"] = slug

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        name = d.pop("name")

        slug = d.pop("slug", UNSET)

        create_org_request = cls(
            name=name,
            slug=slug,
        )

        return create_org_request
