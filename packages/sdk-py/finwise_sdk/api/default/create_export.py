from http import HTTPStatus
from typing import Any, Optional, Union, cast

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.create_export_response import CreateExportResponse
from ...models.create_monthly_summary_pdf_export_request import (
    CreateMonthlySummaryPdfExportRequest,
)
from ...models.create_transactions_csv_export_request import (
    CreateTransactionsCsvExportRequest,
)
from ...types import UNSET, Response, Unset


def _get_kwargs(
    *,
    body: Union[
        "CreateMonthlySummaryPdfExportRequest", "CreateTransactionsCsvExportRequest"
    ],
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
        "url": "/api/v1/exports",
    }

    _body: dict[str, Any]
    if isinstance(body, CreateTransactionsCsvExportRequest):
        _body = body.to_dict()
    else:
        _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[Union[Any, CreateExportResponse]]:
    if response.status_code == 200:
        response_200 = CreateExportResponse.from_dict(response.json())

        return response_200
    if response.status_code == 201:
        response_201 = CreateExportResponse.from_dict(response.json())

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
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[Union[Any, CreateExportResponse]]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: AuthenticatedClient,
    body: Union[
        "CreateMonthlySummaryPdfExportRequest", "CreateTransactionsCsvExportRequest"
    ],
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, CreateExportResponse]]:
    """Create an export job

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (Union['CreateMonthlySummaryPdfExportRequest',
            'CreateTransactionsCsvExportRequest']):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, CreateExportResponse]]
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
    body: Union[
        "CreateMonthlySummaryPdfExportRequest", "CreateTransactionsCsvExportRequest"
    ],
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, CreateExportResponse]]:
    """Create an export job

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (Union['CreateMonthlySummaryPdfExportRequest',
            'CreateTransactionsCsvExportRequest']):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, CreateExportResponse]
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
    body: Union[
        "CreateMonthlySummaryPdfExportRequest", "CreateTransactionsCsvExportRequest"
    ],
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Response[Union[Any, CreateExportResponse]]:
    """Create an export job

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (Union['CreateMonthlySummaryPdfExportRequest',
            'CreateTransactionsCsvExportRequest']):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[Union[Any, CreateExportResponse]]
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
    body: Union[
        "CreateMonthlySummaryPdfExportRequest", "CreateTransactionsCsvExportRequest"
    ],
    x_org_id: Union[Unset, str] = UNSET,
    x_csrf_token: Union[Unset, str] = UNSET,
) -> Optional[Union[Any, CreateExportResponse]]:
    """Create an export job

    Args:
        x_org_id (Union[Unset, str]):
        x_csrf_token (Union[Unset, str]):
        body (Union['CreateMonthlySummaryPdfExportRequest',
            'CreateTransactionsCsvExportRequest']):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Union[Any, CreateExportResponse]
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            x_org_id=x_org_id,
            x_csrf_token=x_csrf_token,
        )
    ).parsed
