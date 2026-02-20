from http import HTTPStatus
from typing import Any, Optional, Union

import httpx

from ... import errors
from ...client import AuthenticatedClient, Client
from ...models.stripe_webhook_body import StripeWebhookBody
from ...models.stripe_webhook_response_200 import StripeWebhookResponse200
from ...types import Response


def _get_kwargs(
    *,
    body: StripeWebhookBody,
    stripe_signature: str,
) -> dict[str, Any]:
    headers: dict[str, Any] = {}
    headers["stripe-signature"] = stripe_signature

    _kwargs: dict[str, Any] = {
        "method": "post",
        "url": "/api/v1/billing/webhook",
    }

    _body = body.to_dict()

    _kwargs["json"] = _body
    headers["Content-Type"] = "application/json"

    _kwargs["headers"] = headers
    return _kwargs


def _parse_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Optional[StripeWebhookResponse200]:
    if response.status_code == 200:
        response_200 = StripeWebhookResponse200.from_dict(response.json())

        return response_200
    if client.raise_on_unexpected_status:
        raise errors.UnexpectedStatus(response.status_code, response.content)
    else:
        return None


def _build_response(
    *, client: Union[AuthenticatedClient, Client], response: httpx.Response
) -> Response[StripeWebhookResponse200]:
    return Response(
        status_code=HTTPStatus(response.status_code),
        content=response.content,
        headers=response.headers,
        parsed=_parse_response(client=client, response=response),
    )


def sync_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    body: StripeWebhookBody,
    stripe_signature: str,
) -> Response[StripeWebhookResponse200]:
    """Stripe webhook (server-to-server)

    Args:
        stripe_signature (str):
        body (StripeWebhookBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StripeWebhookResponse200]
    """

    kwargs = _get_kwargs(
        body=body,
        stripe_signature=stripe_signature,
    )

    response = client.get_httpx_client().request(
        **kwargs,
    )

    return _build_response(client=client, response=response)


def sync(
    *,
    client: Union[AuthenticatedClient, Client],
    body: StripeWebhookBody,
    stripe_signature: str,
) -> Optional[StripeWebhookResponse200]:
    """Stripe webhook (server-to-server)

    Args:
        stripe_signature (str):
        body (StripeWebhookBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StripeWebhookResponse200
    """

    return sync_detailed(
        client=client,
        body=body,
        stripe_signature=stripe_signature,
    ).parsed


async def asyncio_detailed(
    *,
    client: Union[AuthenticatedClient, Client],
    body: StripeWebhookBody,
    stripe_signature: str,
) -> Response[StripeWebhookResponse200]:
    """Stripe webhook (server-to-server)

    Args:
        stripe_signature (str):
        body (StripeWebhookBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        Response[StripeWebhookResponse200]
    """

    kwargs = _get_kwargs(
        body=body,
        stripe_signature=stripe_signature,
    )

    response = await client.get_async_httpx_client().request(**kwargs)

    return _build_response(client=client, response=response)


async def asyncio(
    *,
    client: Union[AuthenticatedClient, Client],
    body: StripeWebhookBody,
    stripe_signature: str,
) -> Optional[StripeWebhookResponse200]:
    """Stripe webhook (server-to-server)

    Args:
        stripe_signature (str):
        body (StripeWebhookBody):

    Raises:
        errors.UnexpectedStatus: If the server returns an undocumented status code and Client.raise_on_unexpected_status is True.
        httpx.TimeoutException: If the request takes longer than Client.timeout.

    Returns:
        StripeWebhookResponse200
    """

    return (
        await asyncio_detailed(
            client=client,
            body=body,
            stripe_signature=stripe_signature,
        )
    ).parsed
