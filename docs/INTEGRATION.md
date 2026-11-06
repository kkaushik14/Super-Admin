# Project administration API v1

**Current integration is read-only.** The connector rejects all action paths and request bodies before dispatch. Resource API v1 now requires signing protocol v2; old signatures are not accepted.

This repository contains the control application only. No ReeloGram code or infrastructure has been changed. Projects must explicitly implement this contract before connection succeeds.

## Enrollment

Add a project slug (2–40 lowercase letters, digits and hyphens), display name, HTTPS origin and environment. Configure its exact hostname in SUPERADMIN_ALLOWED_PROJECT_HOSTS and an independent 32+ character random secret in SUPERADMIN_PROJECT_<SLUG_UPPERCASE_WITH_UNDERSCORES>_SECRET. Configure a non-secret matching `SUPERADMIN_PROJECT_<SLUG_UPPERCASE_WITH_UNDERSCORES>_KEY_ID` as well. Provision the same secret/key ID, exact origin audience, project ID and environment on the project. Never reuse `SUPERADMIN_AUTH_SECRET`. Secrets never enter browser forms or the database. Use separate project IDs and secrets for staging and production.

The connector resolves IPv4 addresses, rejects private addresses, pins the validated address for the actual TLS request, verifies TLS normally, refuses redirects, times out after eight seconds and limits responses to 256 KiB. URLs are administratively allowlisted, not arbitrary user destinations.

## Authenticate every request

The server-only signer is `lib/integrations/admin-signature.ts`. Each read carries `X-Admin-Version: 2`, `X-Admin-Scope: read`, `X-Admin-Project`, `X-Admin-Environment`, `X-Admin-Audience` (the exact registered origin), `X-Admin-Key-Id`, `X-Admin-Time` (Unix seconds), `X-Admin-Nonce` (lowercase UUID v4) and `X-Admin-Signature` (lowercase hex HMAC-SHA256). The signature is over the UTF-8 `JSON.stringify` encoding of this exact positional array:

```text
["reelogram-admin","2","read",projectId,environment,audience,keyId,method,fullPath,time,nonce,sha256Hex(rawBody)]
```

For GET the raw body is empty. Project/environment/audience/credential/scope, exact method/path and all freshness fields are signed. No legacy-signature fallback exists. The receiver must check its configured identity, constant-time signature equality, a maximum 60-second timestamp skew, and atomically consume a project-wide hashed nonce with a 121-second expiry before reading data. Replays must remain blocked across rotated credentials and processes. The current connector only sends the four read paths; it does not send bearer tokens or browser credentials.

ReeloGram returns generic 404 for unauthorized/tampered/replayed/malformed requests, disabled access and write attempts, while verified callers may receive 429/503 for quotas or outages. All responses are no-store/noindex. Its `docs/admin-integration.md` is the receiver setup and security reference.

For planned rotation, provision the new active pair on the receiver and optionally allow the previous pair until an explicit UTC deadline no more than 24 hours ahead. Switch this sender's key ID/secret, verify, then remove the previous pair. For compromise, revoke with no overlap. ReeloGram enforces expiry on every request; both keys share its rate limits and replay namespace. Configuration changes require deployment/restart on both servers. Remove reachable old deployments too. Disconnecting here alone does not revoke a copied key. No environment values are migrated automatically.

## Resource contract and future action design

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

The example above describes the broader planned contract. **ReeloGram currently advertises only `accounts.read`, `videos.read`, and `jobs.read`; all other capabilities remain disabled.** Advertise only supported capabilities. GET /api/admin/v1/accounts, /videos and /jobs return `{ "items": [{ "id": "stable-id", "label": "Display name", "detail": "Safe summary", "status": "active" }] }`, at most 100 items. V1 displays a bounded operational list; pagination and filters will require extending this contract. Never expose secrets, password/reset hashes, confirmation links, parent email addresses or DOB. Jobs should expose only eligible operational notifications; no reset-link replay.

**Future only:** action dispatch is disabled in the current connector. Enabling writes requires separate permissions and fresh owner authorization, not a silent expansion of the read credential. The planned POST /api/admin/v1/actions receives `{action,target,reason,actor,commandId}`. Persist commandId plus a payload digest atomically before applying the operation. Repeated IDs with the same payload must return their original outcome, conflicting payloads must fail. Return HTTP 200 with `{commandId,status}` where status is `succeeded`, `accepted`, or `rejected`. Accepted indicates queued, not completed. Preserve job/provider deduplication and the project's business rules.

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
