# API contract

All three routes require `Authorization: Bearer <access_token>` from the stack's Cognito client, with scope `gloveflow/sessions`. Do not use an ID token. Tokens, passwords, and MFA codes must not be committed, included in screenshots, logged, or pasted into issues.

## Create a session

`POST /sessions`, `Content-Type: application/json`. Maximum decoded request body: 4,096 bytes. Provide exactly these seven fields:

| Field | Required value | Meaning |
| --- | --- | --- |
| `session_id` | Nonzero canonical lowercase UUID | Generate once with `crypto.randomUUID()` when the exercise completes. Reuse it for save retries. |
| `condition` | `bare`, `glove`, or `mouse` | The input condition actually used in the practice task. |
| `duration_ms` | Integer, 1–3,600,000 | Actual elapsed completion time, measured by a monotonic browser clock such as `performance.now()`. Never estimate an improvement. |
| `selections` | Integer, 0–10,000 | Actual selection count for the same timed task. Define what counts as a selection consistently. |
| `tracking_losses` | Integer, 0–10,000, or `null` | Manually observed losses of hand tracking; `null` means not observed/not applicable. Do not infer zero. |
| `errors` | Integer, 0–10,000, or `null` | Manually recorded task errors under a stated test protocol; `null` means not measured. |
| `simulated` | JSON `true` or `false` | `true` for mouse-driven demos, scripted exercises, or synthetic fixtures; `false` only for an actual measured run of the named input condition. |

`condition: mouse` and `simulated: false` is valid for a genuinely timed mouse baseline. A pointer demo pretending to be hand tracking must use `simulated: true`. The server validates types and bounds; it cannot verify the truth of a measurement.

Floating-point numbers, booleans in numeric fields, NaN, duplicate JSON keys, unknown fields, and missing fields are rejected. No frames, landmarks, arbitrary telemetry, or free text can be added to this schema.

The [synthetic fixture](../examples/session.synthetic.json) demonstrates the format. Replace every fixture measurement and its UUID before collecting real evidence.

New creation returns `201`:

```json
{
  "session": {
    "session_id": "e6d8e2bc-e2f5-4cec-93c7-349e0d123def",
    "condition": "glove",
    "duration_ms": 12345,
    "selections": 8,
    "tracking_losses": null,
    "errors": null,
    "simulated": true,
    "created_at": "2026-10-07T12:00:00.000Z"
  },
  "replayed": false
}
```

This response is also synthetic. `created_at` is a server receipt timestamp, not the start or end of the exercise.

An atomic conditional write prevents duplicate or concurrent requests from replacing a record. An identical retry returns `200`, `replayed: true`, and the original timestamp. Changed results under an existing UUID return `409 idempotency_conflict`; they do not update the record. After a network error, `429`, or `503`, retry with exponential backoff and jitter, the **same UUID and unchanged payload**, and a finite client retry limit. Retry authorization failures only after signing in again. A `500` may also be retried with the same ID after a short delay; it must not trigger a new UUID.

Deletion removes the idempotency history. A later POST reusing a deleted UUID creates a new record. This API has no update route.

## List sessions

`GET /sessions?limit=10` returns `{"sessions": [...], "next_cursor": null}`. If `next_cursor` is non-null, URL-encode it and pass it as `cursor` on the next request. `limit` defaults to 10 and must be 1–25. Responses contain only the eight public fields per record and no internal ownership keys. The maximum page stays below roughly 10 KiB for this fixed schema.

Ordering is ascending UUID order. A cursor represents a position, not a snapshot: concurrent creates/deletes can change what appears on later pages. An empty page with a non-null cursor is possible; continue until `next_cursor` is null. Cursors contain a versioned session UUID only. They are not secrets or authorization tokens, and the API always binds them to the currently authenticated user's partition. Passing another user's cursor cannot read that user's data.

## Delete a session

`DELETE /sessions/{session_id}` returns `204` with an empty body. Deleting an absent record or another user's UUID produces the same response; the other user's record remains untouched. Repeated deletion is safe.

## Errors

Application errors have `{"error":{"code":"…","message":"…"}}` and `Cache-Control: no-store`. API Gateway may produce a different body for its own authorizer or throttle errors.

| Status | Meaning |
| --- | --- |
| `400` | Invalid fields, JSON, UUID, query, or cursor. Correct the request. |
| `401` | Missing or invalid access token. |
| `403` | Required scope absent. |
| `404` | Unknown route. |
| `409` | Same UUID used for different results. |
| `413` | Request body exceeds 4 KiB. |
| `415` | Content type is not JSON. |
| `429` | API Gateway throttle; retry with bounded backoff. |
| `500` | Unexpected internal error; response contains no exception details. |
| `503` | Storage unavailable or a concurrent create/delete race; retry the same save. |
