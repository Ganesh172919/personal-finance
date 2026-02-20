from enum import Enum


class ListMarketplaceCatalogStatus(str, Enum):
    ACTIVE = "active"
    DEPRECATED = "deprecated"
    PREVIEW = "preview"

    def __str__(self) -> str:
        return str(self.value)
