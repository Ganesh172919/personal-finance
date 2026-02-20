from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.integration_history_response_history_item import (
        IntegrationHistoryResponseHistoryItem,
    )


T = TypeVar("T", bound="IntegrationHistoryResponse")


@_attrs_define
class IntegrationHistoryResponse:
    """
    Attributes:
        org_id (str):
        connector_key (str):
        history (list['IntegrationHistoryResponseHistoryItem']):
        request_id (str):
    """

    org_id: str
    connector_key: str
    history: list["IntegrationHistoryResponseHistoryItem"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        connector_key = self.connector_key

        history = []
        for history_item_data in self.history:
            history_item = history_item_data.to_dict()
            history.append(history_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "connector_key": connector_key,
                "history": history,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.integration_history_response_history_item import (
            IntegrationHistoryResponseHistoryItem,
        )

        d = src_dict.copy()
        org_id = d.pop("org_id")

        connector_key = d.pop("connector_key")

        history = []
        _history = d.pop("history")
        for history_item_data in _history:
            history_item = IntegrationHistoryResponseHistoryItem.from_dict(
                history_item_data
            )

            history.append(history_item)

        request_id = d.pop("request_id")

        integration_history_response = cls(
            org_id=org_id,
            connector_key=connector_key,
            history=history,
            request_id=request_id,
        )

        return integration_history_response
