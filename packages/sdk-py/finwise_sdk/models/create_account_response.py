from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.account import Account


T = TypeVar("T", bound="CreateAccountResponse")


@_attrs_define
class CreateAccountResponse:
    """
    Attributes:
        org_id (str):
        account (Account):
        request_id (str):
    """

    org_id: str
    account: "Account"
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        account = self.account.to_dict()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "account": account,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.account import Account

        d = src_dict.copy()
        org_id = d.pop("org_id")

        account = Account.from_dict(d.pop("account"))

        request_id = d.pop("request_id")

        create_account_response = cls(
            org_id=org_id,
            account=account,
            request_id=request_id,
        )

        return create_account_response
