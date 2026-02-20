import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.feature_flag_row_metadata import FeatureFlagRowMetadata


T = TypeVar("T", bound="FeatureFlagRow")


@_attrs_define
class FeatureFlagRow:
    """
    Attributes:
        key (str):
        enabled (bool):
        variant (Union[None, str]):
        rollout_percent (int):
        metadata (FeatureFlagRowMetadata):
        updated_at (Union[None, datetime.datetime]):
    """

    key: str
    enabled: bool
    variant: Union[None, str]
    rollout_percent: int
    metadata: "FeatureFlagRowMetadata"
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        key = self.key

        enabled = self.enabled

        variant: Union[None, str]
        variant = self.variant

        rollout_percent = self.rollout_percent

        metadata = self.metadata.to_dict()

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "key": key,
                "enabled": enabled,
                "variant": variant,
                "rollout_percent": rollout_percent,
                "metadata": metadata,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.feature_flag_row_metadata import FeatureFlagRowMetadata

        d = src_dict.copy()
        key = d.pop("key")

        enabled = d.pop("enabled")

        def _parse_variant(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        variant = _parse_variant(d.pop("variant"))

        rollout_percent = d.pop("rollout_percent")

        metadata = FeatureFlagRowMetadata.from_dict(d.pop("metadata"))

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        feature_flag_row = cls(
            key=key,
            enabled=enabled,
            variant=variant,
            rollout_percent=rollout_percent,
            metadata=metadata,
            updated_at=updated_at,
        )

        return feature_flag_row
