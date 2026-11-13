from decimal import Decimal
from unittest.mock import Mock

import httpx
import pytest
from pydantic import SecretStr

import app.services.halyk_epay as halyk_module
from app.services.halyk_epay import (
    HALYK_BOOKING_FEE,
    HALYK_CURRENCY,
    HALYK_OAUTH_TIMEOUT,
    HALYK_PAYMENT_SCOPE,
    HALYK_SANDBOX_OAUTH_URL,
    HalykEpayClient,
    HalykEpayError,
)


CLIENT_SECRET = "unit-test-client-secret"
ACCESS_TOKEN = "unit-test-access-token"
CALLBACK_SECRET = "unit-test-callback-correlation"


def _client() -> HalykEpayClient:
    return HalykEpayClient(
        client_id="sandbox-client",
        client_secret=CLIENT_SECRET,
        terminal_id="sandbox-terminal",
    )


def _request_token(client: HalykEpayClient):
    return client.request_payment_token(
        invoice_id="1234567890",
        secret_hash=CALLBACK_SECRET,
        post_link="https://api.example.test/api/payments/halyk/postlink",
        failure_post_link="https://api.example.test/api/payments/halyk/failure-postlink",
    )


def test_oauth_request_uses_documented_sandbox_form_fields(monkeypatch):
    response = Mock(is_success=True, status_code=200)
    response.json.return_value = {
        "access_token": ACCESS_TOKEN,
        "expires_in": 7200,
        "token_type": "Bearer",
        "scope": HALYK_PAYMENT_SCOPE,
    }
    post = Mock(return_value=response)
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", post)

    result = _request_token(_client())

    post.assert_called_once()
    args, kwargs = post.call_args
    assert args == (HALYK_SANDBOX_OAUTH_URL,)
    assert kwargs["data"] == {
        "grant_type": "client_credentials",
        "scope": "payment",
        "client_id": "sandbox-client",
        "client_secret": CLIENT_SECRET,
        "invoiceID": "1234567890",
        "secret_hash": CALLBACK_SECRET,
        "amount": "100.00",
        "currency": "KZT",
        "terminal": "sandbox-terminal",
        "postLink": "https://api.example.test/api/payments/halyk/postlink",
        "failurePostLink": "https://api.example.test/api/payments/halyk/failure-postlink",
    }
    assert kwargs["timeout"] == HALYK_OAUTH_TIMEOUT
    assert HALYK_BOOKING_FEE == Decimal("100.00")
    assert HALYK_CURRENCY == "KZT"
    assert result.access_token == ACCESS_TOKEN
    assert result.expires_in == 7200
    assert result.token_type == "Bearer"
    assert result.scope == "payment"
    assert ACCESS_TOKEN not in repr(result)


def test_decimal_amount_serialization_preserves_fractional_value_if_changed(monkeypatch):
    response = Mock(is_success=True, status_code=200)
    response.json.return_value = {
        "access_token": ACCESS_TOKEN,
        "expires_in": 7200,
        "token_type": "Bearer",
        "scope": HALYK_PAYMENT_SCOPE,
    }
    post = Mock(return_value=response)
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", post)
    monkeypatch.setattr(halyk_module, "HALYK_BOOKING_FEE", Decimal("100.25"))

    _request_token(_client())

    assert post.call_args.kwargs["data"]["amount"] == "100.25"


@pytest.mark.parametrize(
    "payload",
    [
        [],
        {},
        {"access_token": "token", "expires_in": 7200, "token_type": "Bearer", "scope": "other"},
        {"access_token": "token", "expires_in": 0, "token_type": "Bearer", "scope": "payment"},
        {"access_token": "token", "expires_in": True, "token_type": "Bearer", "scope": "payment"},
        {"access_token": "token", "expires_in": 7200, "token_type": "Basic", "scope": "payment"},
    ],
)
def test_invalid_token_responses_are_rejected_without_echoing_payload(monkeypatch, payload):
    response = Mock(is_success=True, status_code=200)
    response.json.return_value = payload
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", Mock(return_value=response))

    with pytest.raises(HalykEpayError) as error:
        _request_token(_client())

    assert CLIENT_SECRET not in str(error.value)
    assert ACCESS_TOKEN not in str(error.value)
    assert CALLBACK_SECRET not in str(error.value)


def test_malformed_json_response_is_rejected_safely(monkeypatch):
    response = Mock(is_success=True, status_code=200)
    response.json.side_effect = ValueError("malformed response containing " + CLIENT_SECRET)
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", Mock(return_value=response))

    with pytest.raises(HalykEpayError) as error:
        _request_token(_client())

    assert "invalid token response" in str(error.value)
    assert CLIENT_SECRET not in str(error.value)


@pytest.mark.parametrize("missing_field", ["access_token", "expires_in", "scope"])
def test_missing_required_token_fields_are_rejected(monkeypatch, missing_field):
    payload = {
        "access_token": ACCESS_TOKEN,
        "expires_in": 7200,
        "token_type": "Bearer",
        "scope": HALYK_PAYMENT_SCOPE,
    }
    payload.pop(missing_field)
    response = Mock(is_success=True, status_code=200)
    response.json.return_value = payload
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", Mock(return_value=response))

    with pytest.raises(HalykEpayError):
        _request_token(_client())


@pytest.mark.parametrize(
    "client_id, client_secret, terminal_id",
    [
        ("", CLIENT_SECRET, "sandbox-terminal"),
        ("sandbox-client", "", "sandbox-terminal"),
        ("sandbox-client", CLIENT_SECRET, ""),
        ("   ", CLIENT_SECRET, "sandbox-terminal"),
    ],
)
def test_empty_or_invalid_sandbox_configuration_is_rejected_without_request(
    monkeypatch, client_id, client_secret, terminal_id
):
    post = Mock()
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", post)
    client = HalykEpayClient(
        client_id=client_id,
        client_secret=client_secret,
        terminal_id=terminal_id,
    )

    with pytest.raises(HalykEpayError) as error:
        _request_token(client)

    assert "credentials are not configured" in str(error.value)
    assert CLIENT_SECRET not in str(error.value)
    post.assert_not_called()


def test_secretstr_representation_masks_client_secret():
    secret = SecretStr(CLIENT_SECRET)
    client = HalykEpayClient(
        client_id="sandbox-client",
        client_secret=secret,
        terminal_id="sandbox-terminal",
    )

    assert CLIENT_SECRET not in repr(secret)
    assert CLIENT_SECRET not in repr(client)


def test_http_error_does_not_include_response_body(monkeypatch):
    response = Mock(is_success=False, status_code=503, text=CLIENT_SECRET)
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", Mock(return_value=response))

    with pytest.raises(HalykEpayError) as error:
        _request_token(_client())

    assert "503" in str(error.value)
    assert CLIENT_SECRET not in str(error.value)


@pytest.mark.parametrize(
    "exception, message",
    [
        (httpx.ReadTimeout("request contained " + CLIENT_SECRET), "timed out"),
        (httpx.ConnectError("request contained " + CLIENT_SECRET), "unavailable"),
    ],
)
def test_network_errors_are_bounded_and_sanitized(monkeypatch, exception, message):
    monkeypatch.setattr("app.services.halyk_epay.httpx.post", Mock(side_effect=exception))

    with pytest.raises(HalykEpayError) as error:
        _request_token(_client())

    assert message in str(error.value)
    assert CLIENT_SECRET not in str(error.value)
