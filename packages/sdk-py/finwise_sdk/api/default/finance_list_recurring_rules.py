from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.list_recurring_rules_response import ListRecurringRulesResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    params: dict[str, Any] = {}

    params["limit"] = limit

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/finance/recurring",
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, ListRecurringRulesResponse]]:
    if response.status_code == 200:
        response_200 = ListRecurringRulesResponse.from_dict(response.json())

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
) -> Response[Union[Any, ListRecurringRulesResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, ListRecurringRulesResponse]]:
    """List recurring rules

    Args:
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, ListRecurringRulesResponse]]
    """

    kwargs = _get_kwargs(
        limit=limit,
        x_org_id=x_org_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, ListRecurringRulesResponse]]:
    """List recurring rules

    Args:
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, ListRecurringRulesResponse]
    """

    return sync_detailed(
        client=client,
        limit=limit,
        x_org_id=x_org_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, ListRecurringRulesResponse]]:
    """List recurring rules

    Args:
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, ListRecurringRulesResponse]]
    """

    kwargs = _get_kwargs(
        limit=limit,
        x_org_id=x_org_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    limit: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, ListRecurringRulesResponse]]:
    """List recurring rules

    Args:
        limit (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, ListRecurringRulesResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            limit=limit,
            x_org_id=x_org_id,
        )
    ).parsed
