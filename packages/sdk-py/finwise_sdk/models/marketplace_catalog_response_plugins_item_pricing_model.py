from enum import Enum


class MarketplaceCatalogResponsePluginsItemPricingModel(str, Enum):
    FREE = "free"
    PAID = "paid"

    def __str__(self) -> str:
        return str(self.value)
