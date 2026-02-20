from typing import Any, TypeVar

from attrs import define as _attrs_define

T = TypeVar("T", bound="AutopilotRunIdRequest")


@_attrs_define
class AutopilotRunIdRequest:
    """
    Attributes:
        run_id (str):
    """

    run_id: str

    def to_dict(self) -> dict[str, Any]:
        run_id = self.run_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "run_id": run_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        run_id = d.pop("run_id")

        autopilot_run_id_request = cls(
            run_id=run_id,
        )

        return autopilot_run_id_request
