from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define
from attrs import field as _attrs_field

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.process_command_body_options import ProcessCommandBodyOptions


T = TypeVar("T", bound="ProcessCommandBody")


@_attrs_define
class ProcessCommandBody:
    """
    Attributes:
        command (str):
        options (Union[Unset, ProcessCommandBodyOptions]):
    """

    command: str
    options: Union[Unset, "ProcessCommandBodyOptions"] = UNSET
    additional_properties: dict[str, Any] = _attrs_field(init=False, factory=dict)

    def to_dict(self) -> dict[str, Any]:
        command = self.command

        options: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.options, Unset):
            options = self.options.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(self.additional_properties)
        field_dict.update(
            {
                "command": command,
            }
        )
        if options is not UNSET:
            field_dict["options"] = options

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.process_command_body_options import ProcessCommandBodyOptions

        d = src_dict.copy()
        command = d.pop("command")

        _options = d.pop("options", UNSET)
        options: Union[Unset, ProcessCommandBodyOptions]
        if isinstance(_options, Unset):
            options = UNSET
        else:
            options = ProcessCommandBodyOptions.from_dict(_options)

        process_command_body = cls(
            command=command,
            options=options,
        )

        process_command_body.additional_properties = d
        return process_command_body

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
