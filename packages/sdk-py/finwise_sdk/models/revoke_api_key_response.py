import datetime
from typing import Any, TypeVar

from attrs import define as _attrs_define
from dateutil.parser import isoparse

T = TypeVar("T", bound="RevokeApiKeyResponse")


@_attrs_define
class RevokeApiKeyResponse:
    """
    Attributes:
        revoked (bool):
        key_id (str):
        revoked_at (datetime.datetime):
        request_id (str):
    """

    revoked: bool
    key_id: str
    revoked_at: datetime.datetime
    request_id: str

    def to_dict(self) -> dict[str, Any]:
        revoked = self.revoked

        key_id = self.key_id

        revoked_at = self.revoked_at.isoformat()

        request_id = self.request_id

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "revoked": revoked,
                "key_id": key_id,
                "revoked_at": revoked_at,
                "request_id": request_id,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        revoked = d.pop("revoked")

        key_id = d.pop("key_id")

        revoked_at = isoparse(d.pop("revoked_at"))

        request_id = d.pop("request_id")

        revoke_api_key_response = cls(
            revoked=revoked,
            key_id=key_id,
            revoked_at=revoked_at,
            request_id=request_id,
        )

        return revoke_api_key_response
