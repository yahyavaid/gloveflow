"""Run with stdlib only: python3 -m unittest discover -s tests -v."""

import base64
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from service import dispatch, encode_cursor, StoreUnavailable

ALICE = "2d6de6a1-e7dc-4f3d-9725-e522c7a96315"
BOB = "8d6de6a1-e7dc-4f3d-9725-e522c7a96315"
SESSION = "e6d8e2bc-e2f5-4cec-93c7-349e0d123def"
CLIENT = "test-client"
NOW = datetime(2026, 10, 7, 12, 0, 0, tzinfo=timezone.utc)
PAYLOAD = {
    "session_id": SESSION, "condition": "glove", "duration_ms": 12345,
    "selections": 8, "tracking_losses": None, "errors": None, "simulated": True,
}


def event(route="POST /sessions", payload=None, user=ALICE):
    return {
        "routeKey": route,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "requestContext": {"authorizer": {"jwt": {"claims": {
            "sub": user, "token_use": "access", "client_id": CLIENT,
            "scope": "openid gloveflow/sessions",
        }}}},
        "body": json.dumps(PAYLOAD if payload is None else payload),
    }


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.store = Mock()
        self.store.create.side_effect = lambda _user, item: (item, True)
        self.store.list.return_value = ([], None)

    def invoke(self, request):
        return dispatch(request, self.store, CLIENT, now=NOW)

    def assert_rejected_without_storage(self, request, expected=400):
        result = self.invoke(request)
        self.assertEqual(result["statusCode"], expected, result)
        self.assertEqual(self.store.mock_calls, [])

    def test_new_session_has_server_timestamp_and_no_internal_keys(self):
        result = self.invoke(event())
        self.assertEqual(result["statusCode"], 201)
        data = json.loads(result["body"])
        self.assertFalse(data["replayed"])
        self.assertEqual(data["session"]["created_at"], "2026-10-07T12:00:00.000Z")
        self.assertEqual(set(data["session"]), set(PAYLOAD) | {"created_at"})
        self.assertEqual(self.store.create.call_args.args[0], ALICE)
        self.assertEqual(result["headers"]["Cache-Control"], "no-store")

    def test_retry_returns_original_record_without_replacing_timestamp(self):
        original = dict(PAYLOAD, created_at="2026-10-06T09:00:00.000Z", pk="private", sk="private")
        self.store.create.side_effect = None
        self.store.create.return_value = (original, False)
        result = self.invoke(event())
        self.assertEqual(result["statusCode"], 200)
        data = json.loads(result["body"])
        self.assertTrue(data["replayed"])
        self.assertEqual(data["session"]["created_at"], original["created_at"])
        self.assertNotIn("private", result["body"])

    def test_same_id_different_payload_conflicts(self):
        self.store.create.side_effect = None
        self.store.create.return_value = (dict(PAYLOAD, duration_ms=999, created_at="original"), False)
        result = self.invoke(event())
        self.assertEqual(result["statusCode"], 409)
        self.assertNotIn("999", result["body"])

    def test_missing_authorizer_is_not_replaceable_with_header(self):
        request = event()
        request["requestContext"] = {}
        request["headers"]["Authorization"] = "Bearer unverified-token"
        self.assert_rejected_without_storage(request, 401)

    def test_id_token_wrong_client_and_bad_subject_rejected(self):
        for field, value in (("token_use", "id"), ("client_id", "other"), ("sub", "USER#victim")):
            with self.subTest(field=field):
                request = event()
                request["requestContext"]["authorizer"]["jwt"]["claims"][field] = value
                self.assert_rejected_without_storage(request, 401)

    def test_scope_is_an_exact_token(self):
        request = event()
        request["requestContext"]["authorizer"]["jwt"]["claims"]["scope"] = "gloveflow/sessions-admin"
        self.assert_rejected_without_storage(request, 403)

    def test_caller_cannot_supply_ownership_camera_or_free_text_fields(self):
        for field in ("user_id", "pk", "created_at", "camera_frames", "landmarks", "notes", "patient"):
            with self.subTest(field=field):
                self.assert_rejected_without_storage(event(payload=dict(PAYLOAD, **{field: "unwanted"})))

    def test_missing_fields_and_nonobjects_are_rejected(self):
        for payload in ([], "text", {"session_id": SESSION}):
            with self.subTest(payload=payload):
                self.assert_rejected_without_storage(event(payload=payload))

    def test_exact_numeric_types_and_bounds(self):
        cases = [("duration_ms", v) for v in (True, 0, -1, 3_600_001, 1.2, "12", None)]
        cases += [(field, v) for field in ("selections", "tracking_losses", "errors") for v in (True, -1, 10001, 1.2, "1")]
        cases += [("selections", None), ("condition", "clinical"), ("condition", []), ("simulated", 1), ("simulated", "false")]
        for field, value in cases:
            with self.subTest(field=field, value=value):
                self.assert_rejected_without_storage(event(payload=dict(PAYLOAD, **{field: value})))

    def test_manual_unknowns_remain_null_and_zero_is_not_assumed(self):
        result = self.invoke(event())
        item = json.loads(result["body"])["session"]
        self.assertIsNone(item["tracking_losses"])
        self.assertIsNone(item["errors"])

    def test_allowed_conditions_and_observed_bounds(self):
        for condition in ("bare", "glove", "mouse"):
            with self.subTest(condition=condition):
                result = self.invoke(event(payload=dict(PAYLOAD, condition=condition, duration_ms=1,
                                                       selections=0, tracking_losses=10000, errors=0, simulated=False)))
                self.assertEqual(result["statusCode"], 201)

    def test_session_ids_reject_path_injection_nil_and_noncanonical(self):
        for session_id in ("../victim", SESSION.upper(), "00000000-0000-0000-0000-000000000000", 123):
            with self.subTest(session_id=session_id):
                self.assert_rejected_without_storage(event(payload=dict(PAYLOAD, session_id=session_id)))

    def test_duplicate_json_keys_nonfinite_and_malformed_json(self):
        for body in ('{"a":1,"a":2}', '{"duration_ms":NaN}', "{broken", "[" * 1100):
            with self.subTest(body=body[:30]):
                request = event()
                request["body"] = body
                self.assert_rejected_without_storage(request)

    def test_body_limit_counts_utf8_bytes(self):
        request = event()
        request["body"] = '"' + "é" * 2100 + '"'
        self.assert_rejected_without_storage(request, 413)

    def test_base64_payload_and_invalid_base64(self):
        request = event()
        request["isBase64Encoded"] = True
        request["body"] = base64.b64encode(request["body"].encode()).decode()
        self.assertEqual(self.invoke(request)["statusCode"], 201)
        self.store.reset_mock()
        request["body"] = "!not base64!"
        self.assert_rejected_without_storage(request)

    def test_content_type_required(self):
        request = event()
        request["headers"] = {"content-type": "text/plain"}
        self.assert_rejected_without_storage(request, 415)

    def test_each_user_lists_only_their_partition(self):
        for user in (ALICE, BOB):
            result = self.invoke(event("GET /sessions", user=user))
            self.assertEqual(result["statusCode"], 200)
            self.store.list.assert_called_with(user, 10, None)

    def test_bounded_pagination_round_trip(self):
        self.store.list.return_value = ([dict(PAYLOAD, created_at="now", pk="hidden", sk="hidden")], SESSION)
        request = event("GET /sessions")
        request["queryStringParameters"] = {"limit": "1"}
        first = json.loads(self.invoke(request)["body"])
        self.assertEqual(len(first["sessions"]), 1)
        request["queryStringParameters"]["cursor"] = first["next_cursor"]
        self.store.list.return_value = ([], None)
        last = json.loads(self.invoke(request)["body"])
        self.store.list.assert_called_with(ALICE, 1, SESSION)
        self.assertIsNone(last["next_cursor"])

    def test_cursor_cannot_select_another_users_partition(self):
        request = event("GET /sessions", user=BOB)
        request["queryStringParameters"] = {"cursor": encode_cursor(SESSION)}
        self.invoke(request)
        self.store.list.assert_called_with(BOB, 10, SESSION)
        attack = base64.urlsafe_b64encode(json.dumps({"pk": "USER#" + ALICE, "sk": SESSION}).encode()).decode().rstrip("=")
        self.store.reset_mock()
        request["queryStringParameters"]["cursor"] = attack
        self.assert_rejected_without_storage(request)

    def test_invalid_query_limits_and_cursor_rejected(self):
        for query in ({"limit": "0"}, {"limit": "26"}, {"limit": "1.5"}, {"limit": "1,2"},
                      {"limit": "01"}, {"cursor": ""}, {"cursor": "?"}, {"cursor": "A" * 65}, {"user": BOB}):
            with self.subTest(query=query):
                request = event("GET /sessions")
                request["queryStringParameters"] = query
                self.assert_rejected_without_storage(request)

    def test_delete_same_id_by_other_user_uses_other_partition(self):
        for user in (ALICE, BOB, ALICE):
            request = event("DELETE /sessions/{session_id}", user=user)
            request["pathParameters"] = {"session_id": SESSION}
            result = self.invoke(request)
            self.assertEqual(result["statusCode"], 204)
            self.assertEqual(result["body"], "")
            self.store.delete.assert_called_with(user, SESSION)

    def test_delete_missing_id_and_query_override_rejected(self):
        request = event("DELETE /sessions/{session_id}")
        self.assert_rejected_without_storage(request)
        request["pathParameters"] = {"session_id": SESSION}
        request["queryStringParameters"] = {"user": BOB}
        self.assert_rejected_without_storage(request)

    def test_unknown_route_is_not_found(self):
        self.assert_rejected_without_storage(event("GET /admin"), 404)

    def test_store_race_gives_bounded_retry_without_sensitive_details(self):
        self.store.create.side_effect = StoreUnavailable("sensitive internal detail")
        result = self.invoke(event())
        self.assertEqual(result["statusCode"], 503)
        self.assertEqual(result["headers"]["Retry-After"], "2")
        self.assertNotIn("sensitive", result["body"])


if __name__ == "__main__":
    unittest.main()
