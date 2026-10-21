# Gather — personal Teams-inspired workspace

A runnable React + TypeScript app using Vite, Tailwind CSS, Supabase Auth/Postgres/Realtime/private Storage, and LiveKit Cloud video and screen sharing. Original Gather branding; no Microsoft affiliation or assets.

## Start on Windows (PowerShell)

Install Node.js 22.12+ (Node 22 LTS recommended). Open PowerShell in this project folder:

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Open the URL printed by Vite (normally `http://127.0.0.1:5173`). With no credentials the app runs an interactive **local demo**: switch channels, search, and send temporary messages. Demo data resets on refresh/channel changes and is never sent to a backend. Team management, file uploads, authentication and calls require the setup below. If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm`.

## 1. Supabase

1. Create a fresh Supabase project. In its SQL Editor, run **all of `supabase/schema.sql` once**. This migration is transactional but intentionally not repeatable. It creates tables, indexes, auth profile trigger, RLS policies, membership/invitation RPCs, private attachment bucket, and Realtime publication entries. Use a new project, not an unrelated existing database.
2. From Project Settings / API, copy the project URL and **public anon or publishable key** into `.env`:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-key
VITE_LIVEKIT_URL=wss://your-project.livekit.cloud
```

3. In Authentication / URL Configuration, set Site URL to the local origin while developing, and allow the exact local/deployed origins as redirect URLs. Enable Email auth. Confirmation is supported: sign up, follow the confirmation email, then sign in. For a private throwaway development project you can disable email confirmation to accelerate testing. Configure production SMTP before inviting real users; built-in email delivery has limits.
4. Restart Vite after changing `.env`. Create an account and a team. The team gets a General channel automatically. Team owners can add channels and generate **single-use, 24-hour invitation codes**. A second signed-in account can use “Join a team” with that code. Each teammate requires a separate code; the app does not send invitation emails.
5. In two browser profiles, join the same team and verify chat updates without refreshing. Only messages/channels are subscribed to Realtime. Refresh to discover external membership changes; successful joins/creation in this app refresh the team list automatically.

## 2. LiveKit Cloud meetings

Create a LiveKit Cloud project, copy its WebSocket URL into `VITE_LIVEKIT_URL`, and retain its API key and secret **server-side only**. The browser never receives the API secret or a Supabase service-role key.

Install/use the Supabase CLI through npm (Docker is unnecessary for remote deployment):

```powershell
npx supabase login
npx supabase link --project-ref YOUR_SUPABASE_PROJECT_REF
Copy-Item supabase/.env.example supabase/.env
# Edit supabase/.env with your actual LiveKit secrets and allowed web origins.
npx supabase secrets set --env-file supabase/.env
npx supabase functions deploy livekit-token
```

`supabase/config.toml` disables the gateway JWT check for this function because the handler validates the bearer token itself with Supabase Auth. **Do not remove the handler authentication check.** `SUPABASE_URL` and `SUPABASE_ANON_KEY` are provided by hosted Edge Functions automatically. `ALLOWED_ORIGINS` is a comma-separated list of exact origins (no trailing slash), such as `http://127.0.0.1:5173,https://your-app.vercel.app`. If Vite chooses another port, add it or launch on 5173.

“Meet now” fetches a short-lived, channel-scoped token only after a JWT-authenticated RLS channel lookup. All members clicking Meet now in the same channel join the same room. Camera/microphone start off; enable them using the meeting controls. Screen share is included in LiveKit's conference controls. Allow browser device permissions and use HTTPS in production (localhost works for development). On Windows, choose the display/window/tab through the browser's screen-share picker. No call recording is configured.

Token expiration limits joining; it does not forcibly end an established call. Membership revocation and immediate participant ejection are outside this MVP and would require a server-side LiveKit RoomService workflow. Calls are transport-encrypted using LiveKit defaults; end-to-end encryption is not configured.

## 3. Test and production build

```powershell
npm test
npm run build
npm run preview
```

The build includes strict TypeScript checking. Unit tests cover composer boundaries and display initials. `supabase/rls-smoke.sql` is an optional database authorization smoke test: run it as `postgres` in the Supabase SQL Editor after the migration. It uses temporary test users and rolls back. Do not execute only part of the file. Review against your own database first.

Manual end-to-end acceptance:

- Sign up/sign in, sign out, and refresh to confirm session persistence.
- Create a team and channel; invite a second account and redeem the code. A second redemption must fail.
- Send text and an attachment (maximum 10 MB) in two browser profiles. Verify live delivery and attachment download.
- Sign in as a third account without membership: no team/channel/messages should appear. Direct data requests and meeting token requests for the other team's channel must fail.
- Join the same channel meeting from two devices; enable microphones/cameras, share a screen, and leave. Test a different channel to confirm room isolation.

## 4. Deploy the frontend

**Vercel:** Import this folder/repository, select Vite, build command `npm run build`, output directory `dist`. Add the three `VITE_` environment variables from `.env`. Deploy. `vercel.json` provides SPA fallback.

**Netlify:** Import the repository, set this folder as the base directory if nested. The supplied `netlify.toml` builds and publishes `dist`. Add the same environment variables and deploy.

**Any static host:** Run `npm run build` and upload the contents of `dist` to an HTTPS host. Configure unknown paths to serve `index.html`. Vite variables are compiled at build time, so rebuild after changing them. No frontend Node server is needed in production.

Then set Supabase Site URL/allowed redirect URLs to the deployed origin and update `ALLOWED_ORIGINS` in `supabase/.env`; run `npx supabase secrets set --env-file supabase/.env` again. If you changed function source, redeploy it too. Use the deployed origin to sign up a fresh account and complete the two-browser acceptance test above.

Never put `LIVEKIT_API_SECRET` or service-role credentials in a `VITE_` variable, commit `.env` files, or send them to a static host as frontend variables. Public Supabase keys belong in the frontend; database and storage authorization is enforced by RLS.

## Scope and known limitations

Implemented: email/password auth with persisted sessions and confirmation, teams, owner-created channels, single-use invites, member channel chat, live message/channel updates, private file uploads with 60-second download URLs, local loaded-message search, responsive layout, channel meetings with video/audio/screen-share controls, and a credential-free demo.

This is a focused personal MVP. It does **not** include private/direct messages, message edits/deletes/reactions/threads, read receipts, typing/presence, calendar/scheduled meetings, meeting history/recordings, password reset UI, profile editing, team deletion, leave/remove member UI, OAuth/SSO, notifications, pagination beyond the newest 200 messages, full-history search, moderation, malware scanning, rate limiting, or a complete accessibility/browser audit. The rail's Chat shortcut focuses the current channel composer; Meet joins the current channel. Search covers only the 200 loaded messages. Attachments have a 10 MB bucket limit and are downloaded as files; they are not previewed as executable HTML.

An upload that succeeds before a network failure may leave an orphaned object; the app attempts cleanup on send failure, but there is no scheduled orphan cleanup. Realtime delivery errors show a refresh message. No offline queue or background reconnect indicator is implemented. Empty/loading channel states are intentionally simple.

External setup still required: provision Supabase and LiveKit, run SQL, configure auth URLs/email, deploy the token function/secrets, supply frontend public keys, and deploy the site. These require your accounts and have not been provisioned by this project. See `VALIDATION.md` for checks actually run during delivery.

## Structure

- `src/App.tsx`: auth, workspace, team/channel flows, chat, storage and LiveKit UI.
- `src/lib.ts`: Supabase client and shared types/helpers.
- `src/style.css`: Tailwind import and responsive Gather theme.
- `supabase/schema.sql`: full database bootstrap and security policies.
- `supabase/functions/livekit-token/index.ts`: authenticated meeting token service.
- `.env.example` and `supabase/.env.example`: public browser vs private function configuration.

API references: [Supabase password authentication](https://supabase.com/docs/reference/javascript/auth-signinwithpassword), [Supabase file uploads](https://supabase.com/docs/reference/javascript/file-buckets-upload), [LiveKit React room](https://docs.livekit.io/reference/components/react/component/livekitroom/), [LiveKit authentication](https://docs.livekit.io/frontends/build/authentication/).
