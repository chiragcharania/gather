# Delivery checks — 21 October 2026

Passed:

- Installed project dependencies and committed their exact resolution in `package-lock.json`.
- Strict TypeScript compilation: `node node_modules/typescript/bin/tsc -b`.
- Vite production build: `node node_modules/vite/bin/vite.js build --configLoader native`. Ready-to-host output included in `dist/` (demo configuration; rebuild with your credentials).
- Vitest: 1 test file, 2 tests passed using native config loader and a single thread worker.
- Dependency audit after upgrading tooling: zero known vulnerabilities reported by npm.
- Applied the complete SQL schema to embedded PostgreSQL (PGlite), with mock Supabase `auth.users`, `auth.uid`, Storage tables, and `anon`/`authenticated` roles. No schema statements were skipped.
- Executed the transactional `supabase/rls-smoke.sql` in that database: team isolation; forbidden outsider messages; successful invite redemption; failed invite reuse; owner-only invitations and channel creation; author/uploader spoof denial; member text and attachment messages; outsider message, file, and profile isolation.
- Browser demo: startup, sending a message, composer reset, local search, switching channels, credential-required meeting feedback, and mobile channel menu. Inspected layout at the normal viewport and a 390×844 mobile viewport. Fixed chat autoscroll so it scrolls the conversation without displacing the page header.

Environment details:

- Shell Node: 22.23.3. The host's npm script runner unexpectedly selected a separate Node 19 runtime. Checks above invoke the available Node 22 directly; standard scripts are supplied for a normal Node 22+ installation. If you see `styleText` export errors, resolve the older Node installation on PATH and restart PowerShell.
- Default bundled-config loading attempted a child process blocked by the host (`spawn EPERM`). The delivered scripts use Vite's native config loader with an ESM JavaScript config; those equivalent direct checks succeeded.
- The lazy-loaded LiveKit meeting chunk exceeds Vite's default 500 kB warning threshold. This is non-fatal; it is downloaded when a meeting is opened. Initial app JavaScript was approximately 457 kB / 131 kB gzip in the checked build.

Not verified here:

- Hosted Supabase Auth/email, actual Realtime delivery, hosted Storage downloads, or running the migration against your particular Supabase project's built-in schemas. The embedded test checks SQL/RLS behavior, not Supabase's service integrations.
- Deployment/type checking of the Deno Edge Function. Deno and Supabase CLI were not configured in this workspace.
- LiveKit token issuance against a real project, camera/microphone/screen sharing, cross-device calls, and remote frontend deployment. These need your external credentials and accounts.
- Full accessibility, browser compatibility, load/security penetration testing, and production operational hardening.

Use the README's two-account and outsider acceptance checks after provisioning. A build or mocked database test does not establish that external services are configured correctly.
