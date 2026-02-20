from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.send_chat_message_body_options import SendChatMessageBodyOptions


T = TypeVar("T", bound="SendChatMessageBody")


@_attrs_define
class SendChatMessageBody:
    """
    Attributes:
        content (str):
        options (Union[Unset, SendChatMessageBodyOptions]):
    """

    content: str
    options: Union[Unset, "SendChatMessageBodyOptions"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        content = self.content

        options: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.options, Unset):
            options = self.options.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "content": content,
            }
        )
        if options is not UNSET:
            field_dict["options"] = options

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.send_chat_message_body_options import SendChatMessageBodyOptions

        d = src_dict.copy()
        content = d.pop("content")

        _options = d.pop("options", UNSET)
        options: Union[Unset, SendChatMessageBodyOptions]
        if isinstance(_options, Unset):
            options = UNSET
        else:
            options = SendChatMessageBodyOptions.from_dict(_options)

        send_chat_message_body = cls(
            content=content,
            options=options,
        )

        send_chat_message_body.additional_properties = d
        return send_chat_message_body

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
