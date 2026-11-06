# Project administration API v1

This repository contains the control application only. No ReeloGram code or infrastructure has been changed. Projects must explicitly implement this contract before connection succeeds.

## Enrollment

Add a project slug (2–40 lowercase letters, digits and hyphens), display name, HTTPS origin and environment. Configure its exact hostname in ADMIN_ALLOWED_PROJECT_HOSTS and an independent 32+ character random secret in ADMIN_PROJECT_<SLUG_UPPERCASE_WITH_UNDERSCORES>_SECRET. Provision the same secret on the project. Secrets never enter browser forms or the database. Use separate project IDs and secrets for staging and production.

The connector resolves IPv4 addresses, rejects private addresses, pins the validated address for the actual TLS request, verifies TLS normally, refuses redirects, times out after eight seconds and limits responses to 256 KiB. URLs are administratively allowlisted, not arbitrary user destinations.

## Authenticate every request

Headers: X-Admin-Project, X-Admin-Time (Unix seconds), X-Admin-Nonce (random UUID), X-Admin-Signature (hex HMAC SHA-256), Idempotency-Key (command UUID). The signature input is method, full path, time, nonce and exact raw UTF-8 body joined by newline. Empty GET body is an empty string.

The project MUST verify its configured project ID, constant-time signature equality, a maximum 60-second timestamp skew, and atomically consume a nonce with a 120-second expiry. Reject invalid or replayed requests before processing. On actions, authorize the requested capability again within the project. The actor field is asserted by the trusted control service, not a customer session. Disconnecting here stops dispatch; revoke the project secret to revoke the credential itself.

## Endpoints

GET /api/admin/v1/manifest returns:

```json
{
  "projectId": "reelogram",
  "version": "1",
  "capabilities": [
    "accounts.read",
    "accounts.suspend",
    "accounts.restore",
    "accounts.revoke",
    "videos.read",
    "videos.hide",
    "videos.restore",
    "jobs.read",
    "jobs.retry",
    "blocklist.refresh"
  ]
}
```

Advertise only supported capabilities. GET /api/admin/v1/accounts, /videos and /jobs return `{ "items": [{ "id": "stable-id", "label": "Display name", "detail": "Safe summary", "status": "active" }] }`, at most 100 items. V1 displays a bounded operational list; pagination and filters will require extending this contract. Never expose secrets, password/reset hashes, confirmation links, parent email addresses or DOB. Jobs should expose only eligible operational notifications; no reset-link replay.

POST /api/admin/v1/actions receives `{action,target,reason,actor,commandId}`. Persist commandId plus a payload digest atomically before applying the operation. Repeated IDs with the same payload must return their original outcome, conflicting payloads must fail. Return HTTP 200 with `{commandId,status}` where status is `succeeded`, `accepted`, or `rejected`. Accepted indicates queued, not completed. Preserve job/provider deduplication and the project's business rules.

If the response is lost or malformed, Super Admin records `unknown`; it does not retry automatically. Pending/accepted/unknown commands require reconciliation with project records before another submission. Automated command-status reconciliation is a future extension. Never interpret a timeout as proof that the action did not happen.

## ReeloGram adapter checklist for a later, coordinated change

- Session revocation reuses sessionVersion. Suspension needs a durable status checked on sign-in, existing sessions, uploads and mutations.
- Moderation needs a distinct visibility field (do not overload hero/feed placement), with consistent filtering across feed, Reels, showcase, watch pages and sitemaps, plus Redis invalidation.
- All mutations reuse cache guards, ownership checks and existing media locks.
- Retry only eligible notification jobs. Preserve provider choice, ambiguous-delivery safeguards and retry bounds.
- Blocklist refresh preserves the last valid snapshot and coordination lease.
- Parent confirmation and inbox verification remain governed by their existing flows.
- Never delete arbitrary ImageKit files. Permanent deletion is deliberately outside this first version's capability contract.

Test authentication, replay rejection, cross-project credentials, capability denial, idempotency, cache invalidation and provider ambiguity before enabling production controls.
