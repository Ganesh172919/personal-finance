from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.integration_connection_row import IntegrationConnectionRow


T = TypeVar("T", bound="IntegrationConnectionResponse")


@_attrs_define
class IntegrationConnectionResponse:
    """
    Attributes:
        org_id (str):
        connector (IntegrationConnectionRow):
        request_id (str):
    """

    org_id: str
    connector: "IntegrationConnectionRow"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        connector = self.connector.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "connector": connector,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integration_connection_row import IntegrationConnectionRow

        d = src_dict.copy()
        org_id = d.pop("org_id")

        connector = IntegrationConnectionRow.from_dict(d.pop("connector"))

        request_id = d.pop("request_id")

        integration_connection_response = cls(
            org_id=org_id,
            connector=connector,
            request_id=request_id,
        )

        return integration_connection_response
