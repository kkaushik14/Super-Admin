# Super Admin

A standalone, private administration workspace for multiple explicitly connected applications. ReeloGram is registered as the first **unconnected** project. The application never reads ReeloGram's source, environment, database or customer sessions.

## Run locally

Requires Node 24 or newer. From this directory:

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3100. Port 3100 is fixed and separate from ReeloGram's port 3000. ADMIN_PREVIEW=1 enables a read-only development preview. Preview access is disabled in production and cannot authorize mutations. The development server binds only to loopback.

## Administrator setup

```sh
npm run admin:create
```

Enter your email. Save the generated password securely and enroll the printed setup key in an authenticator. These credentials are shown in your terminal only; do not commit or share them. The CLI and application must use the same ADMIN_DATA_DIR (defaults to .data). To use a custom path, export it when running the CLI. Then sign in using email, password and a fresh six-digit authenticator code. Disable ADMIN_PREVIEW when setup is complete.

V1 supports one owner permission level; additional administrators created through the trusted CLI have full access to all registered projects. Per-operator project assignments and delegated roles are not yet implemented. Sessions expire after eight hours, are stored as hashes, and are revoked at logout. Login throttling is durable. The private database contains authenticator secrets and must be protected with encrypted disk storage and restricted backups.

## Implemented

- Responsive overview, project registry, accounts, videos, email operations, maintenance, settings and audit history.
- Durable SQLite registry, session storage, rate counters and action records.
- Password hashing, authenticator verification with replay prevention, HttpOnly same-site session cookies, origin checks and bounded requests.
- Explicit project enrollment and disconnection; allowlisted, signed, bounded server-to-server connections.
- Capability-gated reads and actions, mandatory action reasons, durable command IDs and conservative unknown outcomes.
- Empty states reflect real connection status. No fabricated metrics or customer data.

See [the connection contract](docs/INTEGRATION.md) to implement a project adapter. ReeloGram's integration must be scheduled after its ongoing development work; it has not been modified. Without an adapter and provisioned secret, checks cannot succeed and operational controls remain unavailable.

## Deployment

This version requires a **single Node.js application instance with a persistent local disk**. SQLite is not suitable for stateless Vercel functions or independent replicas. Before deploying there, replace lib/store.ts with a shared database implementation preserving atomic counters, command records and session revocation. Configure ADMIN_ORIGIN to the exact HTTPS dashboard origin, provision credentials securely, keep ADMIN_PREVIEW off, and use a reverse proxy with a request-body limit and HTTPS. No domain or hosting deployment is configured yet.

Back up the database using SQLite's backup mechanism, including active WAL state; encrypt backups. Audit history is append-only through the UI (outcomes can update); it is not tamper-proof against server/database administrators. UI displays the most recent 200 events; define audit retention, export and archival requirements before long-term production use. No background health poller or provider credential editor is included.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:http
```

Security tests use a temporary isolated database. Never use production project secrets for tests. .data, environment files and dependencies are ignored by Git.

## Repository

https://github.com/kkaushik14/Super-Admin

Independent from the ReeloGram repository. All rights reserved.

## Code organization

The project follows ReeloGram's App Router organization: `app/components/` for reusable UI and composed views, `app/api/` for HTTP entry points, `lib/` for server helpers, `models/` for typed domain records, and separate `scripts/`, `tests/` and `docs/`. ESLint uses the same Next.js core-web-vitals and TypeScript rules. `lib/db.ts` owns database initialization; `lib/store.ts` owns persistence operations. Connection signing, request validation and authentication stay outside UI components.

Unlike ReeloGram's MongoDB backend, this first standalone version uses SQLite to support local setup without sharing any project credentials. That is an intentional implementation difference, not identical infrastructure; migrate to a separate shared database before deploying on serverless hosting.
