from enum import Enum


class MarketplaceCatalogResponsePluginsItemStatus(str, Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    PREVIEW = "preview"

    def __str__(self) -> str:
        return str(self.value)
