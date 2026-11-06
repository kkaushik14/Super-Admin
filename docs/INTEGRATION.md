# Project administration API v1

**Read access remains independent.** The read connector rejects all action paths and request bodies. Optional actions use a separate, disabled-by-default controller described in [ADMIN_ACTIONS.md](ADMIN_ACTIONS.md). Resource API v1 now requires signing protocol v2; old signatures are not accepted.

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

## Resources

GET `/api/admin/v1/manifest` returns the matching project ID, version `1`, and explicitly enabled capabilities. The baseline is `accounts.read`, `videos.read`, `jobs.read`. Optional account/video actions appear only when the receiver enables them; local configuration must also authorize them.

GET `/api/admin/v1/accounts`, `/videos`, `/jobs` return `{ "items": [{ "id": "stable-id", "label": "Display name", "detail": "Safe summary", "status": "active" }] }`, at most 100 items. Account/video DTOs add a nonnegative integer `revision`; legacy read responses without it remain readable but cannot be action targets. Suspended accounts and hidden videos use `suspended` / `hidden` status. Never expose credentials, password/reset hashes, confirmation links, parent email or DOB.

See [the action controller and receiver handoff](ADMIN_ACTIONS.md) for the precise dispatch, receipt, authentication and activation protocol. Job retries, account-session-only revocation, blocklist changes and permanent deletion are not supported by this controller.
