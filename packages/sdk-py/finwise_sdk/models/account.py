import datetime
from typing import TYPE_CHECKING, Any, TypeVar, Union, cast

from attrs import define as _attrs_define
from dateutil.parser import isoparse

from ..models.account_status import AccountStatus
from ..models.account_type import AccountType

if TYPE_CHECKING:
    from ..models.account_metadata import AccountMetadata


T = TypeVar("T", bound="Account")


@_attrs_define
class Account:
    """
    Attributes:
        id (str):
        name (str):
        institution (Union[None, str]):
        type_ (AccountType):
        currency (str):
        mask (Union[None, str]):
        status (AccountStatus):
        metadata (AccountMetadata):
        created_at (Union[None, datetime.datetime]):
        updated_at (Union[None, datetime.datetime]):
    """

    id: str
    name: str
    institution: Union[None, str]
    type_: AccountType
    currency: str
    mask: Union[None, str]
    status: AccountStatus
    metadata: "AccountMetadata"
    created_at: Union[None, datetime.datetime]
    updated_at: Union[None, datetime.datetime]

    def to_dict(self) -> dict[str, Any]:
        id = self.id

        name = self.name

        institution: Union[None, str]
        institution = self.institution

        type_ = self.type_.value

        currency = self.currency

        mask: Union[None, str]
        mask = self.mask

        status = self.status.value

        metadata = self.metadata.to_dict()

        created_at: Union[None, str]
        if isinstance(self.created_at, datetime.datetime):
            created_at = self.created_at.isoformat()
        else:
            created_at = self.created_at

        updated_at: Union[None, str]
        if isinstance(self.updated_at, datetime.datetime):
            updated_at = self.updated_at.isoformat()
        else:
            updated_at = self.updated_at

        field_dict: dict[str, Any] = {}
        field_dict.update(
            {
                "id": id,
                "name": name,
                "institution": institution,
                "type": type_,
                "currency": currency,
                "mask": mask,
                "status": status,
                "metadata": metadata,
                "created_at": created_at,
                "updated_at": updated_at,
            }
        )

        return field_dict

    @classmethod
    def from_dict(cls: type[T], src_dict: dict[str, Any]) -> T:
        from ..models.account_metadata import AccountMetadata

        d = src_dict.copy()
        id = d.pop("id")

        name = d.pop("name")

        def _parse_institution(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        institution = _parse_institution(d.pop("institution"))

        type_ = AccountType(d.pop("type"))

        currency = d.pop("currency")

        def _parse_mask(data: object) -> Union[None, str]:
            if data is None:
                return data
            return cast(Union[None, str], data)

        mask = _parse_mask(d.pop("mask"))

        status = AccountStatus(d.pop("status"))

        metadata = AccountMetadata.from_dict(d.pop("metadata"))

        def _parse_created_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                created_at_type_1 = isoparse(data)

                return created_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        created_at = _parse_created_at(d.pop("created_at"))

        def _parse_updated_at(data: object) -> Union[None, datetime.datetime]:
            if data is None:
                return data
            try:
                if not isinstance(data, str):
                    raise TypeError()
                updated_at_type_1 = isoparse(data)

                return updated_at_type_1
            except:  # noqa: E722
                pass
            return cast(Union[None, datetime.datetime], data)

        updated_at = _parse_updated_at(d.pop("updated_at"))

        account = cls(
            id=id,
            name=name,
            institution=institution,
            type_=type_,
            currency=currency,
            mask=mask,
            status=status,
            metadata=metadata,
            created_at=created_at,
            updated_at=updated_at,
        )

        return account
