"""Aggregate-only GloveFlow API. No AWS calls or credential loading in this module."""

import base64
import binascii
import json
import re
from datetime import datetime, timezone
from uuid import UUID


MAX_BODY_BYTES = 4096
MAX_PAGE_SIZE = 25
REQUIRED_SCOPE = "gloveflow/sessions"
FIELDS = frozenset({
    "session_id", "condition", "duration_ms", "selections",
    "tracking_losses", "errors", "simulated",
})
COUNT_FIELDS = ("selections", "tracking_losses", "errors")


class ApiError(Exception):
    def __init__(self, status, code, message):
        self.status, self.code, self.message = status, code, message


class StoreUnavailable(Exception):
    """Retryable persistence failure, including a create/delete race."""


def response(status, body=None, extra_headers=None):
    headers = {"Cache-Control": "no-store", "Content-Type": "application/json"}
    headers.update(extra_headers or {})
    return {
        "statusCode": status,
        "headers": headers,
        "body": "" if body is None else json.dumps(body, separators=(",", ":"), allow_nan=False),
    }


def uuid_string(value, field):
    if not isinstance(value, str) or len(value) != 36:
        raise ApiError(400, "invalid_input", field + " must be a canonical UUID.")
    try:
        parsed = UUID(value)
    except ValueError:
        raise ApiError(400, "invalid_input", field + " must be a canonical UUID.") from None
    if str(parsed) != value or parsed.int == 0:
        raise ApiError(400, "invalid_input", field + " must be a nonzero lowercase UUID.")
    return value


def principal(event, client_id):
    # API Gateway verifies the signature, issuer, audience and expiry first.
    # Never decode an Authorization header here or accept a subject in the body.
    claims = event.get("requestContext", {}).get("authorizer", {}).get("jwt", {}).get("claims", {})
    if (not client_id or not isinstance(claims, dict)
            or claims.get("token_use") != "access" or claims.get("client_id") != client_id):
        raise ApiError(401, "unauthorized", "A valid access token is required.")
    try:
        subject = uuid_string(claims.get("sub"), "subject")
    except ApiError:
        raise ApiError(401, "unauthorized", "A valid access token is required.") from None
    scope = claims.get("scope", "")
    if not isinstance(scope, str) or REQUIRED_SCOPE not in scope.split():
        raise ApiError(403, "forbidden", "The sessions scope is required.")
    return subject


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate key")
        result[key] = value
    return result


def reject_nonfinite(_value):
    raise ValueError("nonfinite JSON number")


def read_payload(event):
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
        raise ApiError(415, "unsupported_media_type", "Use Content-Type: application/json.")
    body = event.get("body")
    if not isinstance(body, str):
        raise ApiError(400, "invalid_json", "A JSON object is required.")
    if len(body) > MAX_BODY_BYTES * 2:
        raise ApiError(413, "payload_too_large", "The request body must be at most 4096 bytes.")
    try:
        raw = base64.b64decode(body, validate=True) if event.get("isBase64Encoded") else body.encode("utf-8")
        if len(raw) > MAX_BODY_BYTES:
            raise ApiError(413, "payload_too_large", "The request body must be at most 4096 bytes.")
        payload = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object, parse_constant=reject_nonfinite)
    except (UnicodeError, ValueError, binascii.Error, RecursionError):
        raise ApiError(400, "invalid_json", "Provide valid JSON without duplicate fields.") from None
    if not isinstance(payload, dict) or set(payload) != FIELDS:
        raise ApiError(400, "invalid_input", "Provide exactly the seven documented session fields.")
    uuid_string(payload["session_id"], "session_id")
    if payload["condition"] not in ("bare", "glove", "mouse"):
        raise ApiError(400, "invalid_input", "condition must be bare, glove, or mouse.")
    if type(payload["duration_ms"]) is not int or not 1 <= payload["duration_ms"] <= 3_600_000:
        raise ApiError(400, "invalid_input", "duration_ms must be an integer from 1 to 3600000.")
    for field in COUNT_FIELDS:
        value = payload[field]
        if value is None and field != "selections":
            continue
        if type(value) is not int or not 0 <= value <= 10_000:
            raise ApiError(400, "invalid_input", field + " must be an integer from 0 to 10000; unobserved manual counters use null.")
    if type(payload["simulated"]) is not bool:
        raise ApiError(400, "invalid_input", "simulated must be a JSON boolean.")
    return payload


def encode_cursor(session_id):
    # Contains only a sort key, never a caller-controlled partition/user key.
    return base64.urlsafe_b64encode(("v1:" + session_id).encode()).decode().rstrip("=")


def decode_cursor(value):
    if not isinstance(value, str) or len(value) > 64 or not re.fullmatch(r"[A-Za-z0-9_-]+", value):
        raise ApiError(400, "invalid_cursor", "The cursor is invalid.")
    try:
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True).decode("ascii")
        if not decoded.startswith("v1:"):
            raise ValueError("unsupported cursor")
        session_id = uuid_string(decoded[3:], "cursor")
        if encode_cursor(session_id) != value:
            raise ValueError("noncanonical cursor")
        return session_id
    except (ValueError, UnicodeError, ApiError):
        raise ApiError(400, "invalid_cursor", "The cursor is invalid.") from None


def list_options(event):
    query = event.get("queryStringParameters") or {}
    if not isinstance(query, dict) or set(query) - {"limit", "cursor"}:
        raise ApiError(400, "invalid_input", "Only limit and cursor query parameters are supported.")
    raw_limit = query.get("limit", "10")
    if not isinstance(raw_limit, str) or not re.fullmatch(r"[1-9][0-9]?", raw_limit):
        raise ApiError(400, "invalid_input", "limit must be an integer from 1 to 25.")
    limit = int(raw_limit)
    if limit > MAX_PAGE_SIZE:
        raise ApiError(400, "invalid_input", "limit must be an integer from 1 to 25.")
    return limit, decode_cursor(query["cursor"]) if "cursor" in query else None


def public_item(item):
    result = {name: item[name] for name in FIELDS}
    result["duration_ms"] = int(result["duration_ms"])
    for name in COUNT_FIELDS:
        if result[name] is not None:
            result[name] = int(result[name])
    result["created_at"] = item["created_at"]
    return result


def dispatch(event, store, client_id, now=None):
    """Store interface: create returns (item, created); list returns (items, next_id)."""
    try:
        subject = principal(event, client_id)
        route = event.get("routeKey")
        if route == "POST /sessions":
            if event.get("queryStringParameters"):
                raise ApiError(400, "invalid_input", "POST does not accept query parameters.")
            payload = read_payload(event)
            stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            item, created = store.create(subject, dict(payload, created_at=stamp))
            if any(item.get(field) != payload[field] for field in FIELDS):
                raise ApiError(409, "idempotency_conflict", "This session_id was already used with different results.")
            return response(201 if created else 200, {"session": public_item(item), "replayed": not created})
        if route == "GET /sessions":
            limit, after = list_options(event)
            items, next_id = store.list(subject, limit, after)
            return response(200, {"sessions": [public_item(item) for item in items],
                                  "next_cursor": encode_cursor(next_id) if next_id else None})
        if route == "DELETE /sessions/{session_id}":
            if event.get("queryStringParameters"):
                raise ApiError(400, "invalid_input", "DELETE does not accept query parameters.")
            session_id = uuid_string((event.get("pathParameters") or {}).get("session_id"), "session_id")
            store.delete(subject, session_id)
            return response(204)
        raise ApiError(404, "not_found", "Route not found.")
    except ApiError as exc:
        return response(exc.status, {"error": {"code": exc.code, "message": exc.message}})
    except StoreUnavailable:
        return response(503, {"error": {"code": "temporarily_unavailable", "message": "Retry with the same session_id and payload."}}, {"Retry-After": "2"})
