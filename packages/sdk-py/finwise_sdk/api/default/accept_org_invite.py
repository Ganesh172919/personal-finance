from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.accept_org_invite_request import AcceptOrgInviteRequest
from ...models.accept_org_invite_response import AcceptOrgInviteResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    body: AcceptOrgInviteRequest,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_csrf_token, Unset):
        headers["X-CSRF-Token"] = x_csrf_token

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/org-invites/accept",
    }

    _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[AcceptOrgInviteResponse, Any]]:
    if response.status_code == 200:
        response_200 = AcceptOrgInviteResponse.from_dict(response.json())

        return response_200
    if response.status_code == 400:
        response_400 = cast(Any, None)
        return response_400
    if response.status_code == 401:
        response_401 = cast(Any, None)
        return response_401
    if response.status_code == 402:
        response_402 = cast(Any, None)
        return response_402
    if response.status_code == 403:
        response_403 = cast(Any, None)
        return response_403
    if response.status_code == 404:
        response_404 = cast(Any, None)
        return response_404
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[AcceptOrgInviteResponse, Any]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: AcceptOrgInviteRequest,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[AcceptOrgInviteResponse, Any]]:
    """Accept an organization invite

    Args:
        x_csrf_token (Union[Unset, str]):
        body (AcceptOrgInviteRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[AcceptOrgInviteResponse, Any]]
    """

    kwargs = _get_kwargs(
        body=body,
        x_csrf_token=x_csrf_token,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: AcceptOrgInviteRequest,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[AcceptOrgInviteResponse, Any]]:
    """Accept an organization invite

    Args:
        x_csrf_token (Union[Unset, str]):
        body (AcceptOrgInviteRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[AcceptOrgInviteResponse, Any]
    """

    return sync_detailed(
        client=client,
        body=body,
        x_csrf_token=x_csrf_token,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: AcceptOrgInviteRequest,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[AcceptOrgInviteResponse, Any]]:
    """Accept an organization invite

    Args:
        x_csrf_token (Union[Unset, str]):
        body (AcceptOrgInviteRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[AcceptOrgInviteResponse, Any]]
    """

    kwargs = _get_kwargs(
        body=body,
        x_csrf_token=x_csrf_token,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: AcceptOrgInviteRequest,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[AcceptOrgInviteResponse, Any]]:
    """Accept an organization invite

    Args:
        x_csrf_token (Union[Unset, str]):
        body (AcceptOrgInviteRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[AcceptOrgInviteResponse, Any]
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            x_csrf_token=x_csrf_token,
        )
    ).parsed
