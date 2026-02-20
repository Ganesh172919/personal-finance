import datetime
from typing import Any, TypeVar

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="CreateFinancialStoryShareResponseShare")


@_attrs_define
class CreateFinancialStoryShareResponseShare:
    """
    Attributes:
        id (str):
        type_ (str):
        token_prefix (str):
        expires_at (datetime.datetime):
        share_url (str):
    """

    id: str
    type_: str
    token_prefix: str
    expires_at: datetime.datetime
    share_url: str

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        type_ = self.type_

        token_prefix = self.token_prefix

        expires_at = self.expires_at.isoformat()

        share_url = self.share_url

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "type": type_,
                "token_prefix": token_prefix,
                "expires_at": expires_at,
                "share_url": share_url,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        type_ = d.pop("type")

        token_prefix = d.pop("token_prefix")

        expires_at = isoparse(d.pop("expires_at"))

        share_url = d.pop("share_url")

        create_financial_story_share_response_share = cls(
            id=id,
            type_=type_,
            token_prefix=token_prefix,
            expires_at=expires_at,
            share_url=share_url,
        )

        return create_financial_story_share_response_share
