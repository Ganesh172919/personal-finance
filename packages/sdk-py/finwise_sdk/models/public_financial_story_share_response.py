import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

if TYPE_CHECKING:
    from ..models.financial_story_share_payload import FinancialStorySharePayload


T = TypeVar("T", bound="PublicFinancialStoryShareResponse")


@_attrs_define
class PublicFinancialStoryShareResponse:
    """
    Attributes:
        share_id (str):
        type_ (str):
        expires_at (Union[None, datetime.datetime]):
        payload (FinancialStorySharePayload):
        request_id (str):
    """

    share_id: str
    type_: str
    expires_at: Union[None, datetime.datetime]
    payload: "FinancialStorySharePayload"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        share_id = self.share_id

        type_ = self.type_

        expires_at: Union[None, str]
        if isinstance(self.expires_at, datetime.datetime):
            expires_at = self.expires_at.isoformat()
        else:
            expires_at = self.expires_at

        payload = self.payload.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "share_id": share_id,
                "type": type_,
                "expires_at": expires_at,
                "payload": payload,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.financial_story_share_payload import FinancialStorySharePayload

        d = src_dict.copy()
        share_id = d.pop("share_id")

        type_ = d.pop("type")

        def _parse_expires_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                expires_at_type_1 = isoparse(data)

                return expires_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        expires_at = _parse_expires_at(d.pop("expires_at"))

        payload = FinancialStorySharePayload.from_dict(d.pop("payload"))

        request_id = d.pop("request_id")

        public_financial_story_share_response = cls(
            share_id=share_id,
            type_=type_,
            expires_at=expires_at,
            payload=payload,
            request_id=request_id,
        )

        return public_financial_story_share_response
