from typing import TYPE_CHECKING, Any, TypeVar

from attrs import define as _attrs_define

if TYPE_CHECKING:
    from ..models.account import Account


T = TypeVar("T", bound="ListAccountsResponse")


@_attrs_define
class ListAccountsResponse:
    """
    Attributes:
        org_id (str):
        accounts (list['Account']):
        request_id (str):
    """

    org_id: str
    accounts: list["Account"]
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        org_id = self.org_id

        accounts = []
        for accounts_item_data in self.accounts:
            accounts_item = accounts_item_data.to_dict()
            accounts.append(accounts_item)

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "org_id": org_id,
                "accounts": accounts,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.account import Account

        d = src_dict.copy()
        org_id = d.pop("org_id")

        accounts = []
        _accounts = d.pop("accounts")
        for accounts_item_data in _accounts:
            accounts_item = Account.from_dict(accounts_item_data)

            accounts.append(accounts_item)

        request_id = d.pop("request_id")

        list_accounts_response = cls(
            org_id=org_id,
            accounts=accounts,
            request_id=request_id,
        )

        return list_accounts_response
