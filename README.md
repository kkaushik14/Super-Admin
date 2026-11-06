# Super Admin · v1.2.0

A separate administration workspace for explicitly connected projects. ReeloGram uses its independently deployed adapter; read-only access and optional explicitly configured moderation controls use separate credentials. Its source, credentials, customer sessions and database are not used by this application.

## Local setup

Requires Node 24+. Run `npm ci`, copy `.env.example` to `.env.local` if needed, fill the private values, then run `npm run dev`. The application uses http://localhost:3100, separate from ReeloGram's port 3000. There is no unauthenticated dashboard or built-in owner password.

The supplied local environment file contains empty credential fields and stable local values. It is ignored by Git. Never copy ReeloGram's MongoDB URI, authentication secret or Google credentials into this project.

## MongoDB / Vercel

Set `SUPERADMIN_MONGODB_URL` to the connection string for a **dedicated database user** with read/write access only to this application's database. Set `SUPERADMIN_MONGODB_DB` to `superadmin_development` locally and `superadmin_production` in Vercel. Use separate credentials for these environments. Database names are restricted to `superadmin` or `superadmin_<environment>` to prevent accidentally targeting ReeloGram.

MongoDB Atlas or a replica set is required: project changes and their audit events use transactions. Connections are reused across warm function invocations with a bounded connection pool. Sessions, throttling and action coordination are stored in MongoDB, not process memory. There is no filesystem persistence dependency in the deployed application.

In Vercel, configure the Super-Admin repository, Node 24, the environment variables in `.env.example`, and `SUPERADMIN_APP_URL` as the exact HTTPS deployment/custom origin. Do not put credentials in `NEXT_PUBLIC_*` variables. Preview deployments need their own database and OAuth callback; the development credentials provider is always disabled on Vercel, including previews.

## Google OAuth: the only production login

Create a Google OAuth **Web application** client dedicated to Super Admin. Configure:

- Local authorized origin: `http://localhost:3100`
- Local redirect URI: `http://localhost:3100/api/auth/callback/google`
- Production redirect URI: `https://<your-admin-domain>/api/auth/callback/google`

Set `SUPERADMIN_GOOGLE_CLIENT_ID`, `SUPERADMIN_GOOGLE_CLIENT_SECRET`, `SUPERADMIN_GOOGLE_OWNER_EMAIL`, and an independent random `SUPERADMIN_AUTH_SECRET` of at least 32 characters. Google account selection does not grant access: the verified email must match the exact configured owner address. The first successful login pins the immutable Google subject in MongoDB; a different subject cannot take over the same email. `SUPERADMIN_GOOGLE_OWNER_SUBJECT` can pin that subject before first login and is required when Google is not authoritative for an external email domain.

NextAuth handles the authorization-code flow, ID-token validation, PKCE, state, nonce, and CSRF protection. The app requests only `openid email profile`, uses no refresh tokens, and does not store or expose Google access/ID tokens. Use Google's account-level MFA; this application does not claim to verify Google's MFA enrollment.

Sessions use a separate `superadmin.*` cookie namespace, HttpOnly cookies, secure cookies on HTTPS, and an eight-hour lifetime. Every protected request rechecks the owner configuration, active administrator, session version, and server-side session record. Removing the allowlisted owner, disabling its MongoDB Admin record, incrementing `sessionVersion`, deleting its session record, or signing out revokes access. There is no public administrator-registration or email/password production endpoint. Do not enable automatic OAuth account linking.

## Local development test login

Optional, off by default:

1. Run `npm run dev:credentials` to generate a temporary password and its encoded bcrypt hash.
2. Set `SUPERADMIN_DEV_EMAIL` and `SUPERADMIN_DEV_PASSWORD_HASH` locally. Use the generated `bcrypt:` value so dotenv does not expand dollar signs in a raw bcrypt hash.
3. Set `SUPERADMIN_DEV_LOGIN_ENABLED=1` and restart `npm run dev`.

The email/password form appears only when all gates pass: `NODE_ENV=development`, no Vercel environment, loopback application origin, explicit flag and configured test credentials. The server independently enforces the same gates. Production builds ignore the flag. Changing the test hash invalidates existing test sessions. Test identities are isolated from Google identities and never link to them. Do not configure production project connection secrets for local test accounts.

## Structure and design

ReeloGram-compatible organization: `app/components`, `app/api`, `lib`, `models`, `scripts`, `tests`, and `docs`. `lib/db.ts` owns the independent MongoDB connection; Mongoose models own indexes and schemas. Authentication policy, account/session handling and NextAuth configuration are separate modules. ESLint uses Next.js core-web-vitals and TypeScript rules.

`app/design-tokens.css` is a copy of ReeloGram's universal soft-monochrome token system. The UI consumes its colors, typography, spacing and control sizes. Decorative microcopy has been removed; body text is 16px, most supporting text 14px, and compact badges 13px. No animation framework or animation behavior is added.

## Project connections and action safety

See [the integration contract](docs/INTEGRATION.md) and [action setup / Development handoff](docs/ADMIN_ACTIONS.md). Project secrets and approved hosts are independent of Google authentication. Commands are recorded before dispatch, unresolved duplicates are rejected atomically, and timeouts remain `unknown` instead of being silently retried. Project enrollment/disconnection and their audit records commit together. Connection checks do not establish general cloud-provider health monitoring.

The interface supports one owner permission level. Unknown remote commands retain their ID and immutable intent; the controller reconciles receipts before bounded, explicitly confirmed retries. Audit data is not tamper-proof against database administrators. Define a retention/backup policy for production; automatic expiry is limited to sessions and rate counters.

## Existing SQLite data

The old `.data/admin.sqlite` is left untouched. It is no longer used. `npm run db:migrate-sqlite` can explicitly import project and audit records into the configured MongoDB database; it never migrates password/TOTP accounts, session cookies or rate counters. Confirm the intended destination environment first. Import preserves existing MongoDB records and old source data. Create Google authorization through the configuration above.

## Validation

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run test:actions
npm run build
npm run test:http
```

Integration tests use disposable MongoDB replica sets. HTTP tests cover a production Google-only server, blocked OAuth callbacks, synthetic Google sessions for route authorization, and a real local development credential sign-in/logout. They do not claim a live Google login succeeded without configured credentials and an interactive Google account.

## Versioning

Version 1.0.0 is the first release. Package metadata, CHANGELOG.md and the annotated `v1.0.0` Git tag identify it. Use patch versions for compatible fixes, minor versions for compatible features and major versions for incompatible changes. The project integration API has an independent version (`1`).

Repository: https://github.com/kkaushik14/Super-Admin

Local ReeloGram read-only connection and credential handoff: [Local connection](docs/LOCAL_CONNECTION.md). With both development servers running, use `npm run test:local` to verify the actual local integration.
