# Gather

**A Teams-inspired collaboration app built with React and TypeScript.**

Gather brings team channels, realtime messaging, private file sharing, and video meetings into one workspace. It is a personal portfolio project focused on connecting a React frontend to authenticated, event-driven backend services.

[Source code](https://github.com/chiragcharania/gather) · [Report an issue](https://github.com/chiragcharania/gather/issues)

**Status:** Working local MVP. Hosted demo deployment is the next step.

## Features

- **Authentication:** Email/password registration, sign-in, and persisted sessions through Supabase Auth.
- **Teams and channels:** Create a team with a default General channel; team owners can create additional channels.
- **Invitations:** Join a team using a single-use invitation code that expires after 24 hours.
- **Realtime chat:** Send channel messages and receive new messages without refreshing.
- **Private attachments:** Upload files up to 10 MB and download through short-lived signed URLs.
- **Channel meetings:** Join a shared LiveKit room with microphone, camera, and screen-sharing controls.
- **Message search:** Filter the newest 200 loaded messages in the current channel.
- **Responsive workspace:** Sidebar navigation and a collapsible channel menu for smaller screens.
- **Credential-free demo:** Explore sample channels and send temporary messages without configuring external services.

## Technology stack

| Area | Technologies |
| --- | --- |
| Frontend | React 19, TypeScript, Vite |
| Styling and icons | Tailwind CSS, custom CSS, Lucide React |
| Authentication and database | Supabase Auth, PostgreSQL |
| Live updates and files | Supabase Realtime, private Supabase Storage |
| Meetings | LiveKit Cloud, LiveKit React components |
| Server-side meeting authorization | Supabase Edge Function, LiveKit server SDK |
| Testing | Vitest, SQL authorization smoke tests |

## React and engineering highlights

- **State and effects:** React hooks coordinate the session, selected workspace, channel messages, file selection, and meeting lifecycle.
- **Subscription cleanup:** Channel effects remove Realtime subscriptions when the selected channel changes or the component unmounts. Query results are guarded against updates after effect cleanup.
- **Controlled forms:** Authentication, team actions, and message composition use controlled inputs, pending states, validation, and error feedback.
- **TypeScript:** Shared types describe teams, channels, and messages; the production build includes strict TypeScript checking.
- **Lazy loading:** The meeting interface loads through `React.lazy` and `Suspense`, keeping the conferencing SDK out of the initial application bundle.
- **Database authorization:** PostgreSQL row-level security enforces team membership independently of what the frontend displays.
- **Server-side credentials:** The meeting function validates the user's session and channel access before generating a short-lived, room-scoped LiveKit token.

The current implementation favors a small number of files to keep the MVP straightforward. Splitting the workspace into dedicated components and data hooks is a planned improvement.

## Architecture

```text
React + TypeScript frontend
    |
    +-- Supabase Auth ---------- Account and session management
    +-- PostgreSQL + RLS ------- Teams, memberships, channels, messages
    +-- Supabase Realtime ------ New messages and channel changes
    +-- Private Storage -------- Attachments and signed download URLs
    |
    +-- livekit-token Edge Function
            |-- Validate Supabase session
            |-- Check channel access through RLS
            +-- Issue room-scoped token --> LiveKit Cloud meeting
```

Each channel maps to a meeting room. Members joining a meeting from the same channel connect to that room. Camera and microphone start disabled.

## Run locally

### Requirements

- Node.js **22.12 or newer** and npm.
- A Supabase project for authenticated features.
- A LiveKit Cloud project for meetings.

### Quick start — Windows PowerShell

```powershell
git clone https://github.com/chiragcharania/gather.git E:\Projects\Gather
Set-Location E:\Projects\Gather
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173`.

With the example credentials unchanged, Gather opens in **demo mode**. Demo messages are temporary and reset when switching channels or refreshing. Authentication, team management, uploads, and meetings require the configuration below.

If PowerShell blocks `npm.ps1`, use `npm.cmd` in place of `npm`.

### Configure Supabase

1. Create a fresh Supabase project.
2. In its SQL Editor, run **the complete `supabase/schema.sql` file once**. It creates tables, indexes, the profile trigger, authorization functions, RLS policies, a private attachment bucket, and Realtime publication entries. The bootstrap is transactional and is not intended to be rerun on an existing installation.
3. Set the public frontend values in the root `.env`:

   ```dotenv
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY
   VITE_LIVEKIT_URL=wss://YOUR_PROJECT.livekit.cloud
   ```

4. Enable email/password authentication. Set the Supabase Site URL and allowed redirect URLs to the exact local origin, including its port.
5. When email confirmation is enabled, confirm the account through the email before signing in. For a public deployment, enable confirmation and configure appropriate email delivery; local testing may use confirmation disabled.
6. Restart the development server after changing `.env`.

Create an account, create a team, and invite another account to test collaboration. Each invitation code can be redeemed once; Gather does not send invitation emails. Refresh to discover membership changes made outside the current app session.

### Configure meetings

Create a LiveKit Cloud project and use its WebSocket URL for `VITE_LIVEKIT_URL` above.

From the project directory:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
Copy-Item supabase/.env.example supabase/.env
```

Edit **`supabase/.env`**, which is separate from the root frontend `.env`:

```dotenv
LIVEKIT_API_KEY=YOUR_LIVEKIT_API_KEY
LIVEKIT_API_SECRET=YOUR_LIVEKIT_API_SECRET
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

Use your actual local port in `ALLOWED_ORIGINS`, with no trailing slash. Then upload the secrets and deploy:

```powershell
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy livekit-token
```

Hosted Edge Functions supply `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Docker is not needed for this remote deployment workflow.

The function configuration sets `verify_jwt = false` at the gateway; **the handler itself validates the bearer token through Supabase Auth before checking channel access**. Keep that authentication check intact.

Restart Gather, open a channel, and select **Meet now**. Use the same channel in another browser profile to join the same room. Allow device access when enabling camera or microphone. Screen sharing uses the browser's display/window/tab picker. Production use requires HTTPS; localhost is supported for development.

## Security boundaries

- Both actual `.env` files are ignored by Git. The committed `.env.example` files contain placeholders only.
- Frontend `VITE_` variables are public at build time. Never place the LiveKit API secret or a Supabase service-role key in them.
- Teams, channels, messages, profiles, and attachments are subject to membership-based access rules.
- Team creation, invitation generation, and invitation redemption use scoped database functions. Channel creation and invitation generation are restricted to team owners.
- Attachments use a private bucket, a 10 MB size limit, and 60-second signed download URLs. Files are downloaded rather than rendered as inline previews.
- Meeting tokens are short-lived and scoped to a channel room. Token expiration restricts new joins; it does not disconnect an established participant.
- Calls use LiveKit's transport encryption. Application-level end-to-end encryption and immediate participant removal after membership changes are not implemented.

## Validation

```powershell
npm test
npm run build
npm run preview
```

The build runs TypeScript checking before generating `dist/`. The two unit tests cover composer validation and display initials; they are not a complete frontend test suite.

**Verified locally with configured services:** account access, team/channel creation, message persistence, realtime chat between two accounts, attachment upload/download, two-account meeting joins, screen sharing, camera video, and microphone activity. The production build also passed on Windows.

**Database checks:** the complete schema and authorization smoke test passed in embedded PostgreSQL with mock Supabase auth/storage tables. The test covers outsider isolation, single-use invitations, owner-only actions, author/uploader spoofing, and attachment access.

To run the database smoke test in a development Supabase project, review and execute **all of `supabase/rls-smoke.sql`** as `postgres` after applying the schema. It creates temporary test data within a transaction and rolls back. Do not execute only part of the file.

The original delivery checks and their environment limitations are recorded in [`VALIDATION.md`](VALIDATION.md). Hosted deployment, cross-device media behavior, and a full accessibility/security audit need further validation.

The production build may warn that the meeting chunk exceeds 500 kB. This warning is non-fatal; the conferencing interface is loaded on demand.

## Deployment

### Vercel

1. Import this repository and select the Vite preset.
2. Set the build command to `npm run build` and output directory to `dist`.
3. Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_LIVEKIT_URL` as frontend environment variables.
4. Deploy. The included `vercel.json` provides SPA fallback.

Netlify is also supported through `netlify.toml`. For other static HTTPS hosts, publish `dist/` and configure unknown paths to serve `index.html`.

After deployment, update Supabase's Site URL and allowed redirect URLs, add the deployed origin to `ALLOWED_ORIGINS`, and upload the function secrets again. Redeploy the function if its source changes. Rebuild the frontend whenever a `VITE_` value changes.

Before sharing the hosted app, verify sign-up, two-account chat, file downloads, and meetings using the deployed URL. Keep private credentials in Supabase function secrets, not frontend hosting variables.

## Project structure

```text
src/
  App.tsx                         Auth, workspace, channel and chat flows
  Meeting.tsx                     Lazy-loaded LiveKit conference interface
  lib.ts                          Supabase client, shared types and helpers
  lib.test.ts                     Helper and composer validation tests
  main.tsx                        React entry point
  style.css                       Tailwind import and responsive styling
supabase/
  schema.sql                      Database bootstrap and RLS policies
  rls-smoke.sql                    Transactional authorization checks
  config.toml                     Edge Function configuration
  functions/livekit-token/
    index.ts                      Authenticated meeting token endpoint
.env.example                      Public frontend configuration template
supabase/.env.example              Private server configuration template
```

## Current limitations and next steps

This is a portfolio MVP rather than a production-ready replacement for Teams.

- **Account management:** No password reset UI, profile editing, or OAuth/SSO.
- **Messaging:** Channel chat only; no direct messages, edits/deletes, reactions, threads, read receipts, typing indicators, or notifications.
- **History:** Only the newest 200 messages load; search covers those messages. Pagination and full-history search are not implemented.
- **Team administration:** No leave/remove-member or team deletion interface.
- **Meetings:** No scheduling, recording, persistent meeting history, or immediate membership-revocation enforcement for active calls.
- **Resilience:** No offline queue, background reconnect indicator, or scheduled orphan-upload cleanup. A failed send attempts attachment cleanup, but network interruptions can leave orphaned files.
- **Hardening:** Rate limiting, malware scanning, moderation, broader automated integration tests, and accessibility/browser audits remain future work.

The Chat navigation shortcut focuses the current channel composer; Meet joins the current channel. Those shortcuts do not represent separate direct-message or calendar features.

## Author

[Chirag Charania](https://github.com/chiragcharania)

Gather uses original branding and is inspired by collaboration tools such as Microsoft Teams. It is not affiliated with Microsoft.
