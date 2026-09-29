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
| Scheduler | Upstash QStash Free | Calls the reminder engine every five minutes |
| Push delivery | Standards-based Web Push | No Apple Developer account or paid push service |

QStash triggers 288 messages/day at a five-minute interval, below its 1,000 messages/day free allowance. No GitHub Actions runner or Vercel paid cron is needed. Vercel Hobby's native cron is intentionally not used because it permits only one run per day and does not offer precise timing.

If a free allowance is exhausted, these providers stop or suspend that resource instead of charging a card that was never registered.

## Features implemented

- Better Auth email/password authentication with 90-day sliding sessions.
- User-scoped PostgreSQL queries for every owned record.
- Habit creation, editing, ordering, archiving, and restoration.
- Event-based entries with timestamps and notes; historical days remain editable.
- Today view with one-tap boolean completion and fast numeric increments.
- Month and full-year calendars with correct “habit did not exist” semantics.
- 90-day overall, per-habit, quantitative, and weekday statistics.
- Per-habit one-time or repeating reminders that stop when the target is met.
- Idempotent notification executions and stale push-subscription cleanup.
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

After redeploying, create the single five-minute schedule from your computer:

```bash
QSTASH_TOKEN=your-token \
APP_URL=https://your-project.vercel.app \
npm run qstash:setup
```

The endpoint verifies QStash signatures. Each run evaluates all enabled reminders in the user's timezone, derives completion from that day's entries, claims a unique `(reminder_id, scheduled_for)` execution, and only then sends Web Push.

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
npm run docker:up       # build and start app + PostgreSQL
npm run docker:logs     # follow container logs
npm run docker:down     # stop containers and preserve data
npm run vapid:generate  # create Web Push key pair
npm run qstash:setup    # register/update the five-minute scheduler
```

## Security notes

- Password hashing is owned by Better Auth; passwords and secrets never enter browser storage.
- Sessions use secure HTTP-only cookies in production and refresh while the app remains in use.
- The API obtains `userId` from the session and never trusts one sent by the client.
- VAPID private keys, database credentials, and QStash signing keys stay server-side.
- The service worker never caches authenticated API responses.
- `npm audit` currently reports a moderate development-only advisory in Drizzle Kit's legacy `esbuild` loader. The suggested automatic fix is an incompatible Drizzle downgrade; the affected dev server is not shipped in the Vercel runtime.
