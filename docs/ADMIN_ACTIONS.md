# Super Admin action controller · v1.2.0

This release implements the controller for `accounts.suspend`, `accounts.restore`, `videos.hide`, and `videos.restore`. Jobs and maintenance remain read-only. Production remains read-only until a separate write pair and explicit enable flags are configured on both applications. The existing read pair is unchanged.

## Configuration and ReeloGram handoff

For registry ID `reelogram`, add these **server-only** variables to Super Admin's Vercel Production environment:

```dotenv
SUPERADMIN_PROJECT_REELOGRAM_ACTIONS_ENABLED=0
SUPERADMIN_PROJECT_REELOGRAM_WRITE_KEY_ID=
SUPERADMIN_PROJECT_REELOGRAM_WRITE_SECRET=
SUPERADMIN_PROJECT_REELOGRAM_OWNER_ID=
SUPERADMIN_PROJECT_REELOGRAM_ACTIONS=accounts.suspend,accounts.restore,videos.hide,videos.restore
```

The Development chat owns the corresponding ReeloGram settings:

```dotenv
REELOGRAM_ADMIN_ACTIONS_ENABLED=0
REELOGRAM_ADMIN_WRITE_KEY_ID=
REELOGRAM_ADMIN_WRITE_SECRET=
REELOGRAM_ADMIN_OWNER_ID=
REELOGRAM_ADMIN_ACTIONS=accounts.suspend,accounts.restore,videos.hide,videos.restore
```

Use one matching **new** key ID and independent secret across these two configurations, separate from read/session secrets and all other environments. Generate at least 32 cryptographically random bytes, store only in private ignored files or the deployment secret store, and never paste the secret into a chat, URL, screenshot or commit. The owner value is `google:<sub>`, using the immutable `subject` pinned in Super Admin's Google Admin record after verified owner login; it is not an email address or a Google OAuth client ID. No ReeloGram database/media/provider credentials belong in Super Admin.

Other registered projects use `SUPERADMIN_PROJECT_<ID_UPPERCASE_WITH_UNDERSCORES>_*`. A project must implement this protocol; advertising an action alone does not enable it. Local fixtures require a separate `-local` project ID and separate credentials under the existing exact-loopback, development-only exception. Development password sessions cannot prepare or execute commands.

**Activation handoff:** no ReeloGram code change is needed against its v1.2.0 handoff. Its owner must provision the matching pair, owner and explicit allowlist. Keep both flags at `0` until live Google freshness is confirmed and a disposable target is approved. Then enable the receiver and controller, redeploy each from its own chat, and use **Check connection** to refresh the remote manifest. Verify a reversible action and its receipt on the approved target before normal use. This release does not enable production writes or mutate customer records.

## Authorization and confirmation

The API revalidates the MongoDB-backed Google owner session on every request. Origin checks, bounded request bodies, exact input fields and database rate limits protect mutations. Browser-supplied actor, authorization time, URL and credential fields are rejected. The controller resolves project configuration from its registry and private environment.

NextAuth validates Google's ID token (issuer/signature/audience, state, PKCE and nonce). The provider requests `claims={"id_token":{"auth_time":{"essential":true}}}`. Only this verified callback's numeric `auth_time` is stored in the server-side session. Missing, invalid and present claims are recorded as sanitized diagnostic states; a stale valid time is preserved rather than replaced by the app login time. A dispatch requires it to be no older than five minutes (30-second future tolerance). Neither token issue time, account selection nor a new app session is a substitute. Missing or stale claims allow read-only login but block dispatch.

**Settings → Action authorization → Verify with Google** works while project actions are disabled and returns to Settings. The command dialog uses the same request. **Verify with Google** requests this claim with `max_age=0`; this is a provider hint, not proof. Google explicitly does not support app-requested Google Account reauthentication. `max_age=0` must not be treated as a forced reauthentication guarantee. A fresh Google browser session may be required. The server always enforces the returned claim. Existing sessions default to no fresh authorization and must sign in again. No MFA guarantee is inferred from `auth_time`. Google also requires the OAuth app to be published and verified, and **Google Auth Platform → Settings → Advanced Settings → Session age claims** enabled before it returns `auth_time`. Only this claim is requested; no new API scopes or authentication-strength claim is needed. See Google's [Security bundle setup](https://developers.google.com/identity/siwg/security-bundle#setup) and [OIDC claim reference](https://developers.google.com/identity/openid-connect/reference).

The private ReeloGram handoff now supplies the matching production values. Super Admin's five production settings have been provisioned with its enable flag `0`; no receiver settings were changed here. A private copy is held under ignored `.data/production-actions/`, outside development env loading. Do not regenerate a different write pair.

The UI displays the exact target, reviewed revision, immutable reason and consequences, and requires an explicit confirmation checkbox. Drafts are persisted before Google verification and reopened by their owned command ID after redirect. New drafts expire for dispatch after ten minutes; cancel and review the current resource again. Pending/unknown commands cannot be cancelled or replaced.

## Wire contract and persistence

Reads still use the independent read connector. Writes use `lib/actions/transport.ts` and `lib/integrations/action-signature.ts` with the existing HTTPS allowlist, public DNS checks, pinned address, no redirects, 8-second timeout and 256 KiB response bound. POST JSON is limited to 8192 bytes.

The signed positional array is:

```text
["reelogram-admin","2","actions",projectId,environment,audience,writeKeyId,method,exactPath,time,freshNonce,sha256Hex(rawBody)]
```

POST `/api/admin/v1/actions` sends exactly `commandId`, `action`, `target`, `reason`, `actor`, `expectedRevision`, `authorizedAt`. Target/revision come from a current read DTO, verified again when preparing the draft. The receiver enforces optimistic concurrency at execution. GET `/api/admin/v1/actions/<commandId>` uses the same write pair and empty body. Both calls use a new UUID nonce and current signature time; retries preserve intent and ID, but may renew real Google authentication time.

MongoDB transactions with majority acknowledgement persist the outbound intent and audit before any dispatch. A unique active record key prevents unresolved commands on the same project/resource/target. Conditional dispatch leases reject concurrent clicks. A fresh process can resume from stored state; no memory/filesystem coordination is required.

HTTP 200 is validated as a terminal receipt bound to the command/action/target, and can be succeeded or rejected. A stale revision requires refreshed records and a newly reviewed intent. Transport/parse failures and nonterminal responses remain unknown. A missing receipt or 404 is not proof no mutation occurred. Reconciliation precedes every explicit retry; at most three dispatches are allowed. A 409 blocks further retries and requires investigation. There is no automatic retry and no replacement command for an uncertain outcome.

Local disabling stops dispatch but still permits receipt checks when the write configuration is retained. Receiver disabling may conceal receipts; the controller preserves the unresolved command. Never purge receipts/command IDs to work around a failure. Audit events cover preparation, attempts, reconciliation, denials and outcomes. They contain no signing secrets, tokens or full headers; database administrators can still edit database storage, so this is not a tamper-proof ledger.

## Consequences and limits

Suspension blocks account access and publishing, revokes sessions, and leaves published videos visible. Restore requires a new login; existing verification rules still apply. Video hiding removes app visibility but does not revoke known public ImageKit URLs. Restoration preserves placement; archived videos remain archived and deletion-pending records cannot be restored. No bulk actions, permanent deletion, emails, job retries or media-provider operations are implemented.

## Verification

Run `npm test`, `npm run test:integration`, `npm run test:actions`, `npm run build`, `npm run typecheck`, `npm run lint`, and `npm run test:http`. The action suite uses a disposable MongoDB replica set and an independent mock HTTP receiver that validates exact signatures and asserts durable intent/audit before accepting requests. It covers duplicate dispatch, wrong owner/provider, stale authentication, stale revisions, missing/lost receipts, restart recovery, bounded retries, 409 conflicts, redirects, disabled actions, origin changes and audit transaction rollback. It does not claim to exercise ReeloGram's business implementation or Google's interactive reauthentication.

## Live readiness finding (6 November 2026)

Google owner login succeeds. Super Admin's dedicated verification button is now available in Settings even with action dispatch disabled. The OAuth project `super-admin-513901` is still in Testing. Google Cloud disables both publishing (branding incomplete) and Session age claims. Its homepage/privacy-policy/terms fields are empty; the existing app name, support contact and authorized `reelogram.org` domain are already configured. An approved Super Admin privacy-policy URL and Google publishing/verification setup are required before the claim can be tested live. No OAuth publishing change or receiver activation was made by this chat.

Do not repeatedly sign out of Super Admin to work around an omitted Google claim. Finish the provider prerequisites, use Settings → Verify with Google, and require `fresh=true` from the owner-authorized endpoint. The sanitized `authenticationClaim` distinguishes an omitted claim from a present but expired value. If the claim is present but old, use a fresh Google browser sign-in; never synthesize a timestamp. Return activation to the Development chat only after this check succeeds.
