# Everyday

A private, mobile-first habit tracker built as an installable Next.js PWA. It keeps event-level history, supports boolean/quantity/duration/count habits, historical editing, conditional Web Push reminders, calendars, and descriptive statistics—without streaks or gamification.

Production: [everyday-habit-tracker-ten.vercel.app](https://everyday-habit-tracker-ten.vercel.app)

## Documentation

- [Developer guide](./docs/DEVELOPER_GUIDE.md): architecture, decisions, local setup, deployment, operations, and roadmap.
- [Docker and new-laptop handoff](./docs/DOCKER_SETUP.md): one-command local stack, image builds, data management, and an agent handoff prompt.
- [Original specification](./docs/ORIGINAL_SPEC.md): the complete source specification preserved verbatim.

## No-card architecture

The original spec used separate Cloudflare frontend/API/cron services. This implementation uses one Next.js application:

| Concern | Service | Free-plan role |
| --- | --- | --- |
| App, API, service worker | Vercel Hobby | Deploys automatically from a personal GitHub repository |
| PostgreSQL | Neon Free | Source of truth; the free plan is available without a payment method |
| Scheduler | Upstash QStash Free | Calls the reminder engine every fifteen minutes |
| Push delivery | Standards-based Web Push | No Apple Developer account or paid push service |
| Password reset email (optional) | Resend Free | Sends the reset link; without it, the link is written to the server log |

QStash triggers 96 messages/day at a fifteen-minute interval, below its 1,000 messages/day free allowance. No GitHub Actions runner or Vercel paid cron is needed. Vercel Hobby's native cron is intentionally not used because it permits only one run per day and does not offer precise timing.

If a free allowance is exhausted, these providers stop or suspend that resource instead of charging a card that was never registered.

## Features implemented

- Better Auth email/password authentication with 90-day sliding sessions.
- "Forgot your password?": a single-use reset link valid for 1 hour, sent by email (Resend) or written to the server log when email isn't configured. Resetting signs out every other session.
- User-scoped PostgreSQL queries for every owned record.
- Habit creation with any custom emoji, plus editing, ordering, archiving, and restoration.
- Event-based entries with timestamps and notes; historical days remain editable.
- Today view with one-tap boolean completion and fast numeric increments.
- Month and full-year calendars with correct “habit did not exist” semantics.
- 90-day overall, per-habit, quantitative, and weekday statistics.
- One-time per-device notification setup, with per-habit reminders that stop when the target is met.
- A rolling one-year discipline heatmap based on daily target completion.
- Idempotent notification executions and stale push-subscription cleanup.
- Optional integration endpoints for a personal bot or script, authenticated by a bearer token: read habits and entries (`/api/integration/habits`), log or undo an entry (`/api/integration/entries`), check the focus lock (`/api/integration/lock`).
- Focus lock: mark habits as non-negotiable and choose what unlocks distracting apps each day (half of today's habits, all non-negotiables, either, or both), optionally only during focus hours such as 07:00–09:00 and 18:00–23:00. An iPhone Shortcut enforces it.
- Installable iPhone PWA, service worker shell cache, offline indicator, and dark mode.

## Local setup

### Fastest: complete Docker stack

With Docker running and Node.js 20.9 or newer installed:

```bash
npm run docker:up
```

This generates ignored local secrets, builds the app image, starts PostgreSQL, applies migrations, and serves Everyday at <http://localhost:3000>. See the [Docker setup guide](./docs/DOCKER_SETUP.md) for phone access, logs, rebuilds, and the new-laptop handoff.

### Native Next.js development

Requirements: Node.js 20.9 or newer and accounts on Neon and Upstash.

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create a free Neon project and copy its pooled PostgreSQL connection string.

3. Create the local environment file.

   ```bash
   cp .env.example .env.local
   ```

4. Fill `DATABASE_URL`, then generate the application secrets.

   ```bash
   openssl rand -base64 32
   npm run vapid:generate
   ```

   Put the random secret in `BETTER_AUTH_SECRET`. Put the generated public VAPID key in `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the private key in `VAPID_PRIVATE_KEY`, and use a real `mailto:` address for `VAPID_SUBJECT`.

5. Apply the committed database migrations.

   ```bash
   npm run db:migrate
   ```

6. Start the app.

   ```bash
   npm run dev
   ```

Web Push requires HTTPS in production. Localhost is treated as a secure context by modern browsers, but iPhone notification testing should be done with the deployed PWA.

## Deploy to Vercel without a card

1. Create a personal GitHub repository and push this project. It can be private. A Vercel Hobby project must connect to a repository owned by your personal GitHub account rather than a GitHub organization.
2. In Vercel, choose **Add New → Project**, import the repository, and keep the detected Next.js defaults.
3. Add every variable from `.env.example` under **Project Settings → Environment Variables**. Set:
   - `BETTER_AUTH_URL=https://your-project.vercel.app`
   - `VAPID_SUBJECT=mailto:your-real-email@example.com`
4. Deploy. After the first deployment, use its final URL for `BETTER_AUTH_URL` and redeploy if the URL changed.
5. Apply migrations from your computer with the production Neon `DATABASE_URL_UNPOOLED` in `.env.local` (the pooled `DATABASE_URL` remains the runtime connection):

   ```bash
   npm run db:migrate
   ```

## Activate reminders

Create an Upstash account, open QStash, and copy the token plus both signing keys into Vercel:

- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`

After redeploying, create the single fifteen-minute schedule from your computer:

```bash
QSTASH_TOKEN=your-token \
APP_URL=https://your-project.vercel.app \
npm run qstash:setup
```

The endpoint verifies QStash signatures. Each run evaluates all enabled reminders in the user's timezone, derives completion from that day's entries, claims a unique `(reminder_id, scheduled_for)` execution, and only then sends Web Push.

## Password reset email (optional)

"Forgot your password?" works without any email service: the reset link is written to the server log, so on Vercel open **Logs**, search for `[email]`, and open the link within 1 hour.

To receive it by email instead, still on a free plan:

1. Create a Resend account (free, no card) and an API key.
2. In Vercel, add `RESEND_API_KEY`, and optionally `EMAIL_FROM` (default `Everyday <onboarding@resend.dev>`). Redeploy.
3. Without a verified domain, Resend's test sender delivers only to the email of your Resend account, which is enough for a personal app. Verify a domain to send to anyone.

## Integration endpoints (optional)

`GET /api/integration/habits?from=YYYY-MM-DD&to=YYYY-MM-DD` returns the same habits, entries and reminders as the app (archived habits included, up to 400 days) to a script that has no browser session, for example a Telegram bot that tracks consistency.

1. Generate a random token and its SHA-256, and keep the token in the integration's own secrets:

   ```bash
   node -e "const t=require('crypto').randomBytes(32).toString('base64url');console.log(t);console.log(require('crypto').createHash('sha256').update(t).digest('hex'))"
   ```

2. In Vercel, add `INTEGRATION_TOKEN_SHA256` (the hex digest, not the token) and `INTEGRATION_USER_EMAIL` (the account to read). Redeploy.
3. Call it with `Authorization: Bearer <token>`. Without both variables the routes answer 404.

`POST /api/integration/entries` with `{ "habitId": "…", "value": 250, "note": "…" }` logs an entry (value defaults to 1, time to now; a yes/no habit keeps one entry per day). `DELETE /api/integration/entries?id=…` removes one.

`POST /api/integration/habits` creates a habit (same fields as the app's editor). `PATCH /api/integration/habits/<id>` edits its name, description, target, unit, icon, color or `nonNegotiable` flag, or archives (`{ "active": false }`) and restores it; type and position stay as they are. The vault's agents use these, e.g. a training coach that requires a habit only on training days.

## Focus lock on iPhone (optional)

Everyday decides whether your distracting apps are locked; an iPhone Shortcut enforces it each time one of them opens.

1. Set up the integration token above (`INTEGRATION_TOKEN_SHA256` and `INTEGRATION_USER_EMAIL`).
2. In Everyday, open **Settings → Focus lock** and pick a rule. To use non-negotiables, edit those habits and turn on **Non-negotiable**. Add **focus hours** to lock apps only during those ranges (for example before and after work); without ranges the lock applies all day. A range may cross midnight, but habits reset at midnight, so after it the new day's habits count.
3. In the Shortcuts app, create a shortcut named **Focus check**:
   1. **Get Contents of URL**: `https://your-project.vercel.app/api/integration/lock`, method GET, header `Authorization` = `Bearer <token>`.
   2. **Get Dictionary Value** for key `message` in Contents of URL.
   3. **If** Dictionary Value **begins with** `Locked`:
      - **Show Notification** with Dictionary Value (e.g. "Locked: finish Workout, Read").
      - **Open URLs** with your Everyday URL. This takes you out of the app you were opening.
4. In **Automation → New Automation → App**, choose the apps to lock (Instagram, TikTok, Chrome…), tick **Is Opened**, choose **Run Immediately**, and run **Focus check**.

`GET /api/integration/lock` answers `{ locked, message, goalMet, focusHours, completed, total, halfNeeded, nonNegotiables: { completed, total, missing } }` for the current time in your timezone. Outside focus hours `locked` is false and `message` is "Unlocked: outside focus hours". "Half" rounds up (3 of 5). With no habit marked non-negotiable, that condition counts as met.

This is a speed bump, not a hard block: the automation can be turned off, and if the request fails (no connection) the app opens normally. iOS does not let Shortcuts see which website Chrome is showing, so locking Chrome locks all of it.

## Install and enable push on iPhone

1. Open the production URL in Safari on iOS 16.4 or newer.
2. Tap **Share → Add to Home Screen**.
3. Open Everyday from the Home Screen—not the Safari tab.
4. Open a habit's menu, choose **Reminder settings**, and tap **Enable**.
5. Accept the notification permission prompt. Permission is requested only after this direct action.

No Apple Developer Program membership or App Store release is required.

## Useful commands

```bash
npm run dev             # local development
npm run typecheck       # strict TypeScript validation
npm run lint            # ESLint
npm run build           # production build
npm run db:generate     # generate a migration after schema changes
npm run db:migrate      # apply committed migrations
npm run db:migrate:prod # apply them to production (DATABASE_URL_UNPOOLED in the ignored .env.neon)
npm run docker:up       # build and start app + PostgreSQL
npm run docker:logs     # follow container logs
npm run docker:down     # stop containers and preserve data
npm run vapid:generate  # create Web Push key pair
npm run qstash:setup    # register/update the fifteen-minute scheduler
```

## Security notes

- Password hashing is owned by Better Auth; passwords and secrets never enter browser storage.
- Sessions use secure HTTP-only cookies in production and refresh while the app remains in use.
- The API obtains `userId` from the session and never trusts one sent by the client.
- VAPID private keys, database credentials, and QStash signing keys stay server-side.
- The service worker never caches authenticated API responses.
- Password reset tokens are random, single-use, expire after 1 hour, and are removed from the address bar once the page loads; a successful reset revokes every session. The request endpoint answers the same way whether or not the email exists.
- The integration endpoints serve a single account and can only read data and add or remove entries. Vercel stores only the token's SHA-256, compared in constant time, so the environment variable alone cannot call it.
- `npm audit` currently reports a moderate development-only advisory in Drizzle Kit's legacy `esbuild` loader. The suggested automatic fix is an incompatible Drizzle downgrade; the affected dev server is not shipped in the Vercel runtime.
