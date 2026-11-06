# Changelog

## 1.2.1 — 2026-11-06

- Initialize collections and indexes explicitly after connecting, avoiding cached automatic initialization failures on fresh databases.
- Add a reconnect regression check and sanitize database initialization diagnostics.

## 1.2.0 — 2026-11-06

- Add separately configured account suspend/restore and video hide/restore controls, disabled by default.
- Require verified Google authentication time, exact target/revision review, reason and explicit confirmation; development passwords never authorize commands.
- Persist immutable intents and durable audits before dispatch; reconcile uncertain receipts, bound retries and reject conflicting/duplicate commands.
- Preserve independent read credentials, SSRF protections, remote capability checks and MongoDB transaction guarantees.
- Add isolated command/signature/fault tests and extend protected HTTP checks. No production customer moderation is performed by the release.

## 1.1.0 — 2026-11-06

- Add a development-only, exact-loopback, read-only project connection with separate local credentials and environment.
- Add reproducible local ReeloGram connection checks and credential handoff documentation.

## 1.0.0 — 2026-11-06

First versioned release of the independent Super Admin application.

- Multi-project dashboard, explicit capability controls and durable audit history.
- Dedicated MongoDB storage compatible with Vercel, transactional project changes, atomic command coordination and shared throttling.
- Google OAuth owner authorization with verified identity, immutable subject binding and revocable server-checked sessions.
- Explicitly enabled local-only development credentials; no password login or unauthenticated preview in production.
- Independent authentication cookies and credentials from ReeloGram.
- ReeloGram design tokens, readable typography and simplified supporting text.
- Isolated security, MongoDB integration and HTTP tests, plus GitHub CI.

Live MongoDB/Google configuration and the ReeloGram adapter are deployment follow-ups. Existing SQLite source data is preserved; legacy password/MFA accounts and sessions are not migrated.
