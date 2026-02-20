from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.paginated_loose_success_response import PaginatedLooseSuccessResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    session_id: str,
    *,
    page: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    params: dict[str, Any] = {}

    params["page"] = page

    params["limit"] = limit

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/chat/sessions/{session_id}/messages".format(
            session_id=session_id,
        ),
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, PaginatedLooseSuccessResponse]]:
    if response.status_code == 200:
        response_200 = PaginatedLooseSuccessResponse.from_dict(response.json())

        return response_200
    if response.status_code == 400:
        response_400 = cast(Any, None)
        return response_400
    if response.status_code == 401:
        response_401 = cast(Any, None)
        return response_401
    if response.status_code == 404:
        response_404 = cast(Any, None)
        return response_404
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[Any, PaginatedLooseSuccessResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    session_id: str,
    *,
    client: AuthenticatedClient,
    page: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, PaginatedLooseSuccessResponse]]:
    """List messages in a chat session

    Args:
        session_id (str):
        page (Union[Unset, int]):
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, PaginatedLooseSuccessResponse]]
    """

    kwargs = _get_kwargs(
        session_id=session_id,
        page=page,
        limit=limit,
        x_org_id=x_org_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    session_id: str,
    *,
    client: AuthenticatedClient,
    page: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, PaginatedLooseSuccessResponse]]:
    """List messages in a chat session

    Args:
        session_id (str):
        page (Union[Unset, int]):
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, PaginatedLooseSuccessResponse]
    """

    return sync_detailed(
        session_id=session_id,
        client=client,
        page=page,
        limit=limit,
        x_org_id=x_org_id,
    ).parsed


async def asyncio_detailed(
    session_id: str,
    *,
    client: AuthenticatedClient,
    page: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, PaginatedLooseSuccessResponse]]:
    """List messages in a chat session

    Args:
        session_id (str):
        page (Union[Unset, int]):
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, PaginatedLooseSuccessResponse]]
    """

    kwargs = _get_kwargs(
        session_id=session_id,
        page=page,
        limit=limit,
        x_org_id=x_org_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    session_id: str,
    *,
    client: AuthenticatedClient,
    page: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, PaginatedLooseSuccessResponse]]:
    """List messages in a chat session

    Args:
        session_id (str):
        page (Union[Unset, int]):
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, PaginatedLooseSuccessResponse]
    """

    return (
        await asyncio_detailed(
            session_id=session_id,
            client=client,
            page=page,
            limit=limit,
            x_org_id=x_org_id,
        )
    ).parsed
