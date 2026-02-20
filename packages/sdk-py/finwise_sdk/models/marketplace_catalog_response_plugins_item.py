import datetime
from typing import Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.marketplace_catalog_response_plugins_item_pricing_model import (
    MarketplaceCatalogResponsePluginsItemPricingModel,
)
from ..models.marketplace_catalog_response_plugins_item_status import (
    MarketplaceCatalogResponsePluginsItemStatus,
)

T = TypeVar("T", bound="MarketplaceCatalogResponsePluginsItem")


@_attrs_define
class MarketplaceCatalogResponsePluginsItem:
    """
    Attributes:
        plugin_key (str):
        name (str):
        description (str):
        publisher (str):
        status (MarketplaceCatalogResponsePluginsItemStatus):
        latest_version (str):
        available_versions (list[str]):
        permissions (list[str]):
        pricing_model (MarketplaceCatalogResponsePluginsItemPricingModel):
        price_monthly_usd (Union[None, float]):
        installed (bool):
        installed_version (Union[None, str]):
        installed_status (Union[None, str]):
        installed_updated_at (Union[None, datetime.datetime]):
    """

    plugin_key: str
    name: str
    description: str
    publisher: str
    status: MarketplaceCatalogResponsePluginsItemStatus
    latest_version: str
    available_versions: list[str]
    permissions: list[str]
    pricing_model: MarketplaceCatalogResponsePluginsItemPricingModel
    price_monthly_usd: Union[None, float]
    installed: bool
    installed_version: Union[None, str]
    installed_status: Union[None, str]
    installed_updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        plugin_key = self.plugin_key

        name = self.name

        description = self.description

        publisher = self.publisher

        status = self.status.value

        latest_version = self.latest_version

        available_versions = self.available_versions

        permissions = self.permissions

        pricing_model = self.pricing_model.value

        price_monthly_usd: Union[None, float]
        price_monthly_usd = self.price_monthly_usd

        installed = self.installed

        installed_version: Union[None, str]
        installed_version = self.installed_version

        installed_status: Union[None, str]
        installed_status = self.installed_status

        installed_updated_at: Union[None, str]
        if isinstance(self.installed_updated_at, datetime.datetime):
            installed_updated_at = self.installed_updated_at.isoformat()
        else:
            installed_updated_at = self.installed_updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "plugin_key": plugin_key,
                "name": name,
                "description": description,
                "publisher": publisher,
                "status": status,
                "latest_version": latest_version,
                "available_versions": available_versions,
                "permissions": permissions,
                "pricing_model": pricing_model,
                "price_monthly_usd": price_monthly_usd,
                "installed": installed,
                "installed_version": installed_version,
                "installed_status": installed_status,
                "installed_updated_at": installed_updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        plugin_key = d.pop("plugin_key")

        name = d.pop("name")

        description = d.pop("description")

        publisher = d.pop("publisher")

        status = MarketplaceCatalogResponsePluginsItemStatus(d.pop("status"))

        latest_version = d.pop("latest_version")

        available_versions = cast(list[str], d.pop("available_versions"))

        permissions = cast(list[str], d.pop("permissions"))

        pricing_model = MarketplaceCatalogResponsePluginsItemPricingModel(
            d.pop("pricing_model")
        )

        def _parse_price_monthly_usd(data: object) -> Union[None, float]:
            if data is None:
                return data
            return cast(Union[None, float], data)

        price_monthly_usd = _parse_price_monthly_usd(d.pop("price_monthly_usd"))

        installed = d.pop("installed")

        def _parse_installed_version(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        installed_version = _parse_installed_version(d.pop("installed_version"))

        def _parse_installed_status(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        installed_status = _parse_installed_status(d.pop("installed_status"))

        def _parse_installed_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                installed_updated_at_type_1 = isoparse(data)

                return installed_updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        installed_updated_at = _parse_installed_updated_at(
            d.pop("installed_updated_at")
        )

        marketplace_catalog_response_plugins_item = cls(
            plugin_key=plugin_key,
            name=name,
            description=description,
            publisher=publisher,
            status=status,
            latest_version=latest_version,
            available_versions=available_versions,
            permissions=permissions,
            pricing_model=pricing_model,
            price_monthly_usd=price_monthly_usd,
            installed=installed,
            installed_version=installed_version,
            installed_status=installed_status,
            installed_updated_at=installed_updated_at,
        )

        return marketplace_catalog_response_plugins_item
