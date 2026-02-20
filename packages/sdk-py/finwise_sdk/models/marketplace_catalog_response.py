from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.marketplace_catalog_response_plugins_item import (
        MarketplaceCatalogResponsePluginsItem,
    )


T = TypeVar("T", bound="MarketplaceCatalogResponse")


@_attrs_define
class MarketplaceCatalogResponse:
    """
    Attributes:
        org_id (str):
        plugins (list['MarketplaceCatalogResponsePluginsItem']):
        request_id (str):
    """

    org_id: str
    plugins: list["MarketplaceCatalogResponsePluginsItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        plugins = []
        for plugins_item_data in self.plugins:
            plugins_item = plugins_item_data.to_dict()
            plugins.append(plugins_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "plugins": plugins,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.marketplace_catalog_response_plugins_item import (
            MarketplaceCatalogResponsePluginsItem,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        plugins = []
        _plugins = d.pop("plugins")
        for plugins_item_data in _plugins:
            plugins_item = MarketplaceCatalogResponsePluginsItem.from_dict(
                plugins_item_data
            )

            plugins.append(plugins_item)

        request_id = d.pop("request_id")

        marketplace_catalog_response = cls(
            org_id=org_id,
            plugins=plugins,
            request_id=request_id,
        )

        return marketplace_catalog_response
