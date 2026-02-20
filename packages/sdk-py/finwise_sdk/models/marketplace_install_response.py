from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.marketplace_install_response_install import (
        MarketplaceInstallResponseInstall,
    )


T = TypeVar("T", bound="MarketplaceInstallResponse")


@_attrs_define
class MarketplaceInstallResponse:
    """
    Attributes:
        org_id (str):
        install (MarketplaceInstallResponseInstall):
        request_id (str):
    """

    org_id: str
    install: "MarketplaceInstallResponseInstall"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        install = self.install.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "install": install,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.marketplace_install_response_install import (
            MarketplaceInstallResponseInstall,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        install = MarketplaceInstallResponseInstall.from_dict(d.pop("install"))

        request_id = d.pop("request_id")

        marketplace_install_response = cls(
            org_id=org_id,
            install=install,
            request_id=request_id,
        )

        return marketplace_install_response
