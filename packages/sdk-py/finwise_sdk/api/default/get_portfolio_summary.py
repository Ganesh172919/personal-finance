from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.loose_success_response import LooseSuccessResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    months: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    params: dict[str, Any] = {}

    params["months"] = months

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/portfolio/summary",
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, LooseSuccessResponse]]:
    if response.status_code == 200:
        response_200 = LooseSuccessResponse.from_dict(response.json())

        return response_200
    if response.status_code == 401:
        response_401 = cast(Any, None)
        return response_401
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[Any, LooseSuccessResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    months: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, LooseSuccessResponse]]:
    """Get portfolio summary

    Args:
        months (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, LooseSuccessResponse]]
    """

    kwargs = _get_kwargs(
        months=months,
        x_org_id=x_org_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    months: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, LooseSuccessResponse]]:
    """Get portfolio summary

    Args:
        months (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, LooseSuccessResponse]
    """

    return sync_detailed(
        client=client,
        months=months,
        x_org_id=x_org_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    months: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, LooseSuccessResponse]]:
    """Get portfolio summary

    Args:
        months (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, LooseSuccessResponse]]
    """

    kwargs = _get_kwargs(
        months=months,
        x_org_id=x_org_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    months: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, LooseSuccessResponse]]:
    """Get portfolio summary

    Args:
        months (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, LooseSuccessResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            months=months,
            x_org_id=x_org_id,
        )
    ).parsed
