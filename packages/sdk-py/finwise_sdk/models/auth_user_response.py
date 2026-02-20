from typing import Any, TypeVar, Union

from attrs import define as _attrs_define

from ..types import UNSET, Unset

T = TypeVar("T", bound="AuthUserResponse")


@_attrs_define
class AuthUserResponse:
    """
    Attributes:
        id (str):
        name (str):
        email (str):
        request_id (str):
        photo_url (Union[Unset, str]):
    """

    id: str
    name: str
    email: str
    request_id: str
    photo_url: Union[Unset, str] = UNSET

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        email = self.email

        request_id = self.request_id

        photo_url = self.photo_url

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "email": email,
                "request_id": request_id,
            }
        )
        if photo_url is not UNSET:
            field_dict["photoURL"] = photo_url

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        email = d.pop("email")

        request_id = d.pop("request_id")

        photo_url = d.pop("photoURL", UNSET)

        auth_user_response = cls(
            id=id,
            name=name,
            email=email,
            request_id=request_id,
            photo_url=photo_url,
        )

        return auth_user_response
