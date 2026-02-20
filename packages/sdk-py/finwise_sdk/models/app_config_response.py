from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.app_config_response_features import AppConfigResponseFeatures
    from ..models.app_config_response_org_type_1 import AppConfigResponseOrgType1
    from ..models.entitlement_snapshot import EntitlementSnapshot


T = TypeVar("T", bound="AppConfigResponse")


@_attrs_define
class AppConfigResponse:
    """
    Attributes:
        org (Union['AppConfigResponseOrgType1', None]):
        features (AppConfigResponseFeatures):
        entitlements (Union['EntitlementSnapshot', None]):
        request_id (str):
    """

    org: Union["AppConfigResponseOrgType1", None]
    features: "AppConfigResponseFeatures"
    entitlements: Union["EntitlementSnapshot", None]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        from ..models.app_config_response_org_type_1 import AppConfigResponseOrgType1
        from ..models.entitlement_snapshot import EntitlementSnapshot

        org: Union[None, dict[str, Any]]
        if isinstance(self.org, AppConfigResponseOrgType1):
            org = self.org.to_dict()
        else:
            org = self.org

        features = self.features.to_dict()

        entitlements: Union[None, dict[str, Any]]
        if isinstance(self.entitlements, EntitlementSnapshot):
            entitlements = self.entitlements.to_dict()
        else:
            entitlements = self.entitlements

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org": org,
                "features": features,
                "entitlements": entitlements,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.app_config_response_features import AppConfigResponseFeatures
        from ..models.app_config_response_org_type_1 import AppConfigResponseOrgType1
        from ..models.entitlement_snapshot import EntitlementSnapshot

        d = src_dict.copy()

        def _parse_org(data: object) -> Union["AppConfigResponseOrgType1", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                org_type_1 = AppConfigResponseOrgType1.from_dict(data)

                return org_type_1
            except:  # noqa: E722
                pass
            return cast(Union["AppConfigResponseOrgType1", None], data)

        org = _parse_org(d.pop("org"))

        features = AppConfigResponseFeatures.from_dict(d.pop("features"))

        def _parse_entitlements(data: object) -> Union["EntitlementSnapshot", None]:
            if data is None:
                return data
            try:
                if not isinstance(data, dict):
                    raise TypeError()
                entitlements_type_1 = EntitlementSnapshot.from_dict(data)

                return entitlements_type_1
            except:  # noqa: E722
                pass
            return cast(Union["EntitlementSnapshot", None], data)

        entitlements = _parse_entitlements(d.pop("entitlements"))

        request_id = d.pop("request_id")

        app_config_response = cls(
            org=org,
            features=features,
            entitlements=entitlements,
            request_id=request_id,
        )

        return app_config_response
