from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.logout_response import LogoutResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_csrf_token, Unset):
        headers["X-CSRF-Token"] = x_csrf_token

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/auth/logout",
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, LogoutResponse]]:
    if response.status_code == 200:
        response_200 = LogoutResponse.from_dict(response.json())

        return response_200
    if response.status_code == 403:
        response_403 = cast(Any, None)
        return response_403
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[Any, LogoutResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, LogoutResponse]]:
    """Logout (clears session cookie)

    Args:
        x_csrf_token (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, LogoutResponse]]
    """

    kwargs = _get_kwargs(
        x_csrf_token=x_csrf_token,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: Union[AuthenticatedClient, Client],
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, LogoutResponse]]:
    """Logout (clears session cookie)

    Args:
        x_csrf_token (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, LogoutResponse]
    """

    return sync_detailed(
        client=client,
        x_csrf_token=x_csrf_token,
    ).parsed


async def asyncio_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, LogoutResponse]]:
    """Logout (clears session cookie)

    Args:
        x_csrf_token (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, LogoutResponse]]
    """

    kwargs = _get_kwargs(
        x_csrf_token=x_csrf_token,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: Union[AuthenticatedClient, Client],
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, LogoutResponse]]:
    """Logout (clears session cookie)

    Args:
        x_csrf_token (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, LogoutResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            x_csrf_token=x_csrf_token,
        )
    ).parsed
