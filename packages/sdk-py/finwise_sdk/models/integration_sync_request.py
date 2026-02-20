from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="IntegrationSyncRequest")


@_attrs_define
class IntegrationSyncRequest:
    """
    Attributes:
        records_synced (Union[Unset, int]):
        simulate_error (Union[Unset, bool]):
    """

    records_synced: Union[Unset, int] = UNSET
    simulate_error: Union[Unset, bool] = UNSET

    def to_dict(self) -> dict[str, Any]:
        records_synced = self.records_synced

        simulate_error = self.simulate_error

        field_dict: dict[str, Any] = {}
        field_dict.update({})
        if records_synced is not UNSET:
            field_dict["records_synced"] = records_synced
        if simulate_error is not UNSET:
            field_dict["simulate_error"] = simulate_error

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        records_synced = d.pop("records_synced", UNSET)

        simulate_error = d.pop("simulate_error", UNSET)

        integration_sync_request = cls(
            records_synced=records_synced,
            simulate_error=simulate_error,
        )

        return integration_sync_request
