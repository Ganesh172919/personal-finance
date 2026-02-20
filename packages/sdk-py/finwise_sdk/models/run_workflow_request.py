from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="RunWorkflowRequest")


@_attrs_define
class RunWorkflowRequest:
    """
    Attributes:
        idempotency_key (Union[Unset, str]):
    """

    idempotency_key: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        idempotency_key = self.idempotency_key

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if idempotency_key is not UNSET:
            field_dict["idempotency_key"] = idempotency_key

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        idempotency_key = d.pop("idempotency_key", UNSET)

        run_workflow_request = cls(
            idempotency_key=idempotency_key,
        )

        return run_workflow_request
