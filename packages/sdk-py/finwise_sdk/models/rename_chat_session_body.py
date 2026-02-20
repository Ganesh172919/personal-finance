from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="RenameChatSessionBody")


@_attrs_define
class RenameChatSessionBody:
    """
    Attributes:
        title (str):
    """

    title: str

    def to_dict(self) -> dict[str, Any]:
        title = self.title

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "title": title,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        title = d.pop("title")

        rename_chat_session_body = cls(
            title=title,
        )

        return rename_chat_session_body
