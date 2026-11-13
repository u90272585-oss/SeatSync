"""Halyk ePay Sandbox client for Hosted Payment Page OAuth tokens."""

from dataclasses import dataclass, field
from decimal import Decimal
from typing import Union

import httpx
from pydantic import SecretStr


HALYK_SANDBOX_OAUTH_URL = "https://test-epay-oauth.epayment.kz/oauth2/token"
HALYK_PAYMENT_SCOPE = "payment"
HALYK_BOOKING_FEE = Decimal("100.00")
HALYK_CURRENCY = "KZT"
HALYK_OAUTH_TIMEOUT = httpx.Timeout(connect=3.0, read=10.0, write=10.0, pool=3.0)


class HalykEpayError(Exception):
    """Sanitized error raised for configuration or Sandbox communication failures."""


@dataclass(frozen=True)
class HalykPaymentToken:
    # Repr is suppressed to reduce the chance of accidental token logging.
    access_token: str = field(repr=False)
    expires_in: int
    token_type: str
    scope: str


class HalykEpayClient:
    """Small client for the documented Hosted Payment Page Sandbox token flow."""

    def __init__(
        self,
        *,
        client_id: str,
        client_secret: Union[str, SecretStr],
        terminal_id: str,
    ) -> None:
        self._client_id = client_id
        self._client_secret = (
            client_secret.get_secret_value() if isinstance(client_secret, SecretStr) else client_secret
        )
        self._terminal_id = terminal_id

    def request_payment_token(
        self,
        *,
        invoice_id: str,
        secret_hash: str,
        post_link: str,
        failure_post_link: str,
    ) -> HalykPaymentToken:
        """Request a payment-scoped token for one Hosted Payment Page attempt.

        The returned access token is for internal backend use by the caller.
        This method does not log or persist credentials, tokens, or secret_hash.
        """
        self._validate_configuration()
        self._validate_payment_fields(invoice_id, secret_hash, post_link, failure_post_link)

        form_data = {
            "grant_type": "client_credentials",
            "scope": HALYK_PAYMENT_SCOPE,
            "client_id": self._client_id,
            "client_secret": self._client_secret,
            "invoiceID": invoice_id,
            "secret_hash": secret_hash,
            # Preserve the Decimal value exactly; do not route money through float or int.
            "amount": format(HALYK_BOOKING_FEE, "f"),
            "currency": HALYK_CURRENCY,
            "terminal": self._terminal_id,
            "postLink": post_link,
            "failurePostLink": failure_post_link,
        }

        try:
            response = httpx.post(
                HALYK_SANDBOX_OAUTH_URL,
                data=form_data,
                timeout=HALYK_OAUTH_TIMEOUT,
            )
        except httpx.TimeoutException:
            raise HalykEpayError("Halyk Sandbox token request timed out.") from None
        except httpx.RequestError:
            raise HalykEpayError("Halyk Sandbox token service is unavailable.") from None

        if not response.is_success:
            raise HalykEpayError(
                f"Halyk Sandbox token service returned HTTP {response.status_code}."
            )

        try:
            payload = response.json()
        except (ValueError, TypeError):
            raise HalykEpayError("Halyk Sandbox returned an invalid token response.") from None

        return self._parse_token_response(payload)

    def _validate_configuration(self) -> None:
        if not self._client_id.strip() or not self._client_secret.strip() or not self._terminal_id.strip():
            raise HalykEpayError("Halyk Sandbox credentials are not configured.")

    @staticmethod
    def _validate_payment_fields(
        invoice_id: str,
        secret_hash: str,
        post_link: str,
        failure_post_link: str,
    ) -> None:
        if not invoice_id or len(invoice_id) > 32:
            raise HalykEpayError("A valid invoice ID is required.")
        if not secret_hash or len(secret_hash) > 128:
            raise HalykEpayError("A valid payment correlation value is required.")
        if not post_link or not failure_post_link:
            raise HalykEpayError("Both Halyk callback URLs are required.")

    @staticmethod
    def _parse_token_response(payload: object) -> HalykPaymentToken:
        if not isinstance(payload, dict):
            raise HalykEpayError("Halyk Sandbox returned an invalid token response.")

        access_token = payload.get("access_token")
        expires_in = payload.get("expires_in")
        token_type = payload.get("token_type")
        scope = payload.get("scope")

        if not isinstance(access_token, str) or not access_token.strip():
            raise HalykEpayError("Halyk Sandbox token response is missing an access token.")
        if isinstance(expires_in, bool) or not isinstance(expires_in, int) or expires_in <= 0:
            raise HalykEpayError("Halyk Sandbox token response has an invalid expiry.")
        if not isinstance(token_type, str) or token_type.lower() != "bearer":
            raise HalykEpayError("Halyk Sandbox token response has an unsupported token type.")
        if not isinstance(scope, str) or scope.strip() != HALYK_PAYMENT_SCOPE:
            raise HalykEpayError("Halyk Sandbox token response has an unexpected scope.")

        return HalykPaymentToken(
            access_token=access_token,
            expires_in=expires_in,
            token_type=token_type,
            scope=scope,
        )
