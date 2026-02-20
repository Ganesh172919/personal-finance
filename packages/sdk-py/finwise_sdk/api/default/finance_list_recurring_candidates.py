from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.recurring_candidates_response import RecurringCandidatesResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    days_back: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    min_occurrences: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    params: dict[str, Any] = {}

    params["days_back"] = days_back

    params["limit"] = limit

    params["min_occurrences"] = min_occurrences

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/finance/recurring/candidates",
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, RecurringCandidatesResponse]]:
    if response.status_code == 200:
        response_200 = RecurringCandidatesResponse.from_dict(response.json())

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
) -> Response[Union[Any, RecurringCandidatesResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    days_back: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    min_occurrences: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, RecurringCandidatesResponse]]:
    """Detect recurring candidates

    Args:
        days_back (Union[Unset, int]):
        limit (Union[Unset, int]):
        min_occurrences (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, RecurringCandidatesResponse]]
    """

    kwargs = _get_kwargs(
        days_back=days_back,
        limit=limit,
        min_occurrences=min_occurrences,
        x_org_id=x_org_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    days_back: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    min_occurrences: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, RecurringCandidatesResponse]]:
    """Detect recurring candidates

    Args:
        days_back (Union[Unset, int]):
        limit (Union[Unset, int]):
        min_occurrences (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, RecurringCandidatesResponse]
    """

    return sync_detailed(
        client=client,
        days_back=days_back,
        limit=limit,
        min_occurrences=min_occurrences,
        x_org_id=x_org_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    days_back: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    min_occurrences: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, RecurringCandidatesResponse]]:
    """Detect recurring candidates

    Args:
        days_back (Union[Unset, int]):
        limit (Union[Unset, int]):
        min_occurrences (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, RecurringCandidatesResponse]]
    """

    kwargs = _get_kwargs(
        days_back=days_back,
        limit=limit,
        min_occurrences=min_occurrences,
        x_org_id=x_org_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    days_back: Union[Unset, int] = UNSET,
    limit: Union[Unset, int] = UNSET,
    min_occurrences: Union[Unset, int] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, RecurringCandidatesResponse]]:
    """Detect recurring candidates

    Args:
        days_back (Union[Unset, int]):
        limit (Union[Unset, int]):
        min_occurrences (Union[Unset, int]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, RecurringCandidatesResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            days_back=days_back,
            limit=limit,
            min_occurrences=min_occurrences,
            x_org_id=x_org_id,
        )
    ).parsed
