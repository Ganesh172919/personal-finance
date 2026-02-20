from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.transactions_csv_import_request import TransactionsCsvImportRequest
from ...models.transactions_csv_import_response import TransactionsCsvImportResponse
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    body: TransactionsCsvImportRequest,
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    if not isinstance(x_org_id, Unset):
        headers["X-Org-Id"] = x_org_id

    if not isinstance(x_csrf_token, Unset):
        headers["X-CSRF-Token"] = x_csrf_token

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/integrations/transactions_csv/import",
    }

    _body = body.to_multipart()

    _kwargs["files"] = _body

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, TransactionsCsvImportResponse]]:
    if response.status_code == 200:
        response_200 = TransactionsCsvImportResponse.from_dict(response.json())

        return response_200
    if response.status_code == 201:
        response_201 = TransactionsCsvImportResponse.from_dict(response.json())

        return response_201
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
) -> Response[Union[Any, TransactionsCsvImportResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: TransactionsCsvImportRequest,
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, TransactionsCsvImportResponse]]:
    """Import transactions from CSV (admin)

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (TransactionsCsvImportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, TransactionsCsvImportResponse]]
    """

    kwargs = _get_kwargs(
        body=body,
        x_org_id=x_org_id,
        x_csrf_token=x_csrf_token,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: AuthenticatedClient,
    body: TransactionsCsvImportRequest,
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, TransactionsCsvImportResponse]]:
    """Import transactions from CSV (admin)

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (TransactionsCsvImportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, TransactionsCsvImportResponse]
    """

    return sync_detailed(
        client=client,
        body=body,
        x_org_id=x_org_id,
        x_csrf_token=x_csrf_token,
    ).parsed


async def asyncio_detailed(
    *,
    client: AuthenticatedClient,
    body: TransactionsCsvImportRequest,
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, TransactionsCsvImportResponse]]:
    """Import transactions from CSV (admin)

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (TransactionsCsvImportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, TransactionsCsvImportResponse]]
    """

    kwargs = _get_kwargs(
        body=body,
        x_org_id=x_org_id,
        x_csrf_token=x_csrf_token,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: AuthenticatedClient,
    body: TransactionsCsvImportRequest,
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, TransactionsCsvImportResponse]]:
    """Import transactions from CSV (admin)

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (TransactionsCsvImportRequest):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, TransactionsCsvImportResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            x_org_id=x_org_id,
            x_csrf_token=x_csrf_token,
        )
    ).parsed
