# Local read-only ReeloGram connection

The local project is `reelogram-local`, named **ReeloGram Local**, with environment `local` and origin `http://localhost:3000`. Super Admin runs at `http://localhost:3100` and stores its registry, audit and sessions in its independently configured `superadmin_development` database. The existing `reelogram` production registry entry remains unconnected and unchanged.

## Local configuration

Secrets are generated independently and stored only in ignored, owner-readable files. Never copy the local credential to Vercel.

| File                                 | Keys configured                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Super Admin/.env.development.local` | `SUPERADMIN_LOCAL_PROJECT_ORIGIN`, `SUPERADMIN_PROJECT_REELOGRAM_LOCAL_SECRET`, a local `SUPERADMIN_AUTH_SECRET`, `SUPERADMIN_DEV_LOGIN_ENABLED`, `SUPERADMIN_DEV_EMAIL`, `SUPERADMIN_DEV_PASSWORD_HASH` |
| `ReeloGram/.env.development.local`   | `REELOGRAM_ADMIN_ENABLED=1`, `REELOGRAM_ADMIN_PROJECT_ID=reelogram-local`, `REELOGRAM_ADMIN_SECRET`                                                                                                      |

The two connection-secret values match. Authentication secrets are separate. Existing MongoDB and Google configuration remains in the existing env files. `.env.development.local` is loaded by `next dev`, not production builds or `next start`. These files are never committed. The generated test login is in `Super Admin/.data/local-test-account.json` (also ignored and owner-readable). Use **Development test account** on the local login page. Set `SUPERADMIN_DEV_LOGIN_ENABLED=0` in the development override to disable it and invalidate its sessions.

The HTTP exception accepts only the exact configured loopback origin, only in development, only when Super Admin itself uses a loopback origin, and never on Vercel. Requests are pinned to `127.0.0.1` and require a `local` project with a separate `-local` ID. The local connector accepts only GET manifest/accounts/videos/jobs requests, strips write capabilities, and rejects commands independently of advertised permissions. Production's HTTPS/public-address restrictions remain enforced.

ReeloGram still verifies HMAC signatures, timestamps, nonces and rate limits. Account, video and email-job business records are read only; security nonce/counter records and Super Admin audit/session records are written. Results are limited to 100 summaries per resource, not a full export. Super Admin never needs ReeloGram's database, Redis, email or ImageKit credentials.

## Verification

With both development servers running, execute `npm run test:local` from Super Admin. It checks unauthenticated denial, invalid signatures, replay denial, write-method denial, actual development login/logout, local enrollment/connection, all three resource lists, command rejection, same-origin protection, and unchanged production registration. It also verifies Google OAuth initiation with state, nonce, PKCE and the localhost callback; it does not complete Google's interactive sign-in. No emails are sent and no business records are changed.

The script requires the generated local test-account file and `superadmin_development`; it refuses other origins/environments. It leaves the local project connected and revokes its own test session. Unit tests, MongoDB integration tests, lint, type checking and the production build cover regression checks. Restart Super Admin after schema changes so development's cached Mongoose models reload.

## Credentials for a later production rollout — not enabled now

The supplied screenshot shows auth secret, MongoDB URL, Google client ID/secret, owner email and app URL already entered. Presence does not verify their values. Before a separately authorized rollout:

- Super Admin: set `SUPERADMIN_MONGODB_DB` to a dedicated production database (for example `superadmin_production`), `SUPERADMIN_ALLOWED_PROJECT_HOSTS=www.reelogram.in`, and a **new production-only** `SUPERADMIN_PROJECT_REELOGRAM_SECRET`.
- ReeloGram: use matching `REELOGRAM_ADMIN_PROJECT_ID=reelogram` and `REELOGRAM_ADMIN_SECRET`. Keep `REELOGRAM_ADMIN_ENABLED=0` until rollout is explicitly approved; enabling it later requires `1`.
- Keep `SUPERADMIN_APP_URL` equal to the actual HTTPS admin origin and register its exact `/api/auth/callback/google` URL in the Google OAuth client. For local Google login, also register `http://localhost:3100/api/auth/callback/google`.
- `SUPERADMIN_GOOGLE_OWNER_SUBJECT` is optional for Gmail or an authoritative Workspace identity; otherwise pin the owner's verified Google subject.
- Do not add local project secrets, local origin, generated test credentials or the development enable flag to Vercel. Keep production auth secrets and database credentials separate from development and from ReeloGram.

No additional credentials are required for the working local read-only connection. Live Google OAuth completion and production deployment remain separate checks.

## Signing protocol v2

Local connections now also require matching `SUPERADMIN_PROJECT_REELOGRAM_LOCAL_KEY_ID` / `REELOGRAM_ADMIN_KEY_ID`, `REELOGRAM_ADMIN_ENVIRONMENT=local`, and `REELOGRAM_ADMIN_AUDIENCE=http://localhost:3000`. Keep the existing independent local secret pair; do not reuse production credentials. The receiver must be explicitly enabled. Old signatures fail with generic 404. Settings are not migrated automatically; see `INTEGRATION.md`. The same read-only restriction applies to remote connections.
