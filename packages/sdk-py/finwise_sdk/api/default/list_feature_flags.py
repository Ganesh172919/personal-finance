from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.feature_flags_list_response import FeatureFlagsListResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    key_prefix: Union[Unset, str] = UNSET,
    enabled: Union[Unset, bool] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    params: dict[str, Any] = {}

    params["key_prefix"] = key_prefix

    params["enabled"] = enabled

    params = {k: v for k, v in params.items() if v is not UNSET and v is not None}

    _kwargs: dict[str, Any] = {
        "method": "get",
        "url": "/api/v1/feature-flags",
        "params": params,
    }

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, FeatureFlagsListResponse]]:
    if response.status_code == 200:
        response_200 = FeatureFlagsListResponse.from_dict(response.json())

        return response_200
    if response.status_code == 401:
        response_401 = cast(Any, None)
        return response_401
    if response.status_code == 403:
        response_403 = cast(Any, None)
        return response_403
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[Any, FeatureFlagsListResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    key_prefix: Union[Unset, str] = UNSET,
    enabled: Union[Unset, bool] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, FeatureFlagsListResponse]]:
    """List feature flags for the active org

    Args:
        key_prefix (Union[Unset, str]):
        enabled (Union[Unset, bool]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, FeatureFlagsListResponse]]
    """

    kwargs = _get_kwargs(
        key_prefix=key_prefix,
        enabled=enabled,
        x_org_id=x_org_id,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    key_prefix: Union[Unset, str] = UNSET,
    enabled: Union[Unset, bool] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, FeatureFlagsListResponse]]:
    """List feature flags for the active org

    Args:
        key_prefix (Union[Unset, str]):
        enabled (Union[Unset, bool]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, FeatureFlagsListResponse]
    """

    return sync_detailed(
        client=client,
        key_prefix=key_prefix,
        enabled=enabled,
        x_org_id=x_org_id,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    key_prefix: Union[Unset, str] = UNSET,
    enabled: Union[Unset, bool] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Response[Union[Any, FeatureFlagsListResponse]]:
    """List feature flags for the active org

    Args:
        key_prefix (Union[Unset, str]):
        enabled (Union[Unset, bool]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, FeatureFlagsListResponse]]
    """

    kwargs = _get_kwargs(
        key_prefix=key_prefix,
        enabled=enabled,
        x_org_id=x_org_id,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    key_prefix: Union[Unset, str] = UNSET,
    enabled: Union[Unset, bool] = UNSET,
    x_org_id: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, FeatureFlagsListResponse]]:
    """List feature flags for the active org

    Args:
        key_prefix (Union[Unset, str]):
        enabled (Union[Unset, bool]):
        x_org_id (Union[Unset, str]):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, FeatureFlagsListResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            key_prefix=key_prefix,
            enabled=enabled,
            x_org_id=x_org_id,
        )
    ).parsed
