from typing import TYPE_CHECKING, Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

if TYPE_CHECKING:
    from ..models.feature_flag_upsert_request_metadata import (
        FeatureFlagUpsertRequestMetadata,
    )


T = TypeVar("T", bound="FeatureFlagUpsertRequest")


@_attrs_define
class FeatureFlagUpsertRequest:
    """
    Attributes:
        enabled (bool):
        variant (Union[Unset, str]):
        rollout_percent (Union[Unset, int]):
        metadata (Union[Unset, FeatureFlagUpsertRequestMetadata]):
    """

    enabled: bool
    variant: Union[Unset, str] = UNSET
    rollout_percent: Union[Unset, int] = UNSET
    metadata: Union[Unset, "FeatureFlagUpsertRequestMetadata"] = UNSET

    def to_dict(self) -> dict[str, Any]:
        enabled = self.enabled

        variant = self.variant

        rollout_percent = self.rollout_percent

        metadata: Union[Unset, dict[str, Any]] = UNSET
        if not isinstance(self.metadata, Unset):
            metadata = self.metadata.to_dict()

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "enabled": enabled,
            }
        )
        if variant is not UNSET:
            field_dict["variant"] = variant
        if rollout_percent is not UNSET:
            field_dict["rollout_percent"] = rollout_percent
        if metadata is not UNSET:
            field_dict["metadata"] = metadata

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.feature_flag_upsert_request_metadata import (
            FeatureFlagUpsertRequestMetadata,
        )

        d = src_dict.copy()
        enabled = d.pop("enabled")

        variant = d.pop("variant", UNSET)

        rollout_percent = d.pop("rollout_percent", UNSET)

        _metadata = d.pop("metadata", UNSET)
        metadata: Union[Unset, FeatureFlagUpsertRequestMetadata]
        if isinstance(_metadata, Unset):
            metadata = UNSET
        else:
            metadata = FeatureFlagUpsertRequestMetadata.from_dict(_metadata)

        feature_flag_upsert_request = cls(
            enabled=enabled,
            variant=variant,
            rollout_percent=rollout_percent,
            metadata=metadata,
        )

        return feature_flag_upsert_request
