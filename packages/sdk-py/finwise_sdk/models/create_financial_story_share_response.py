from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.create_financial_story_share_response_share import (
        CreateFinancialStoryShareResponseShare,
    )


T = TypeVar("T", bound="CreateFinancialStoryShareResponse")


@_attrs_define
class CreateFinancialStoryShareResponse:
    """
    Attributes:
        share (CreateFinancialStoryShareResponseShare):
        token (str):
        request_id (str):
    """

    share: "CreateFinancialStoryShareResponseShare"
    token: str
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        share = self.share.to_dict()

        token = self.token

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "share": share,
                "token": token,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.create_financial_story_share_response_share import (
            CreateFinancialStoryShareResponseShare,
        )

        d = src_dict.copy()
        share = CreateFinancialStoryShareResponseShare.from_dict(d.pop("share"))

        token = d.pop("token")

        request_id = d.pop("request_id")

        create_financial_story_share_response = cls(
            share=share,
            token=token,
            request_id=request_id,
        )

        return create_financial_story_share_response
