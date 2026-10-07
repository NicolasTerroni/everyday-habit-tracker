# Everyday — Developer Guide

This document explains how the application is built, why the architecture differs slightly from the original specification, how to run and deploy it, and what should be built next.

The unmodified product specification is preserved in [ORIGINAL_SPEC.md](./ORIGINAL_SPEC.md).

## 1. Current status

Everyday is a working V1 habit tracker with:

- email/password authentication and long-lived sliding sessions;
- boolean, quantity, duration, and count habits;
- event-level entries with timestamps and optional notes;
- one-tap completion, quick numerical entries, editing, and undo;
- habit editing, ordering, archiving, and restoration;
- month and year history views;
- descriptive 90-day statistics;
- conditional, repeating Web Push reminders;
- idempotent notification execution;
- an installable mobile-first PWA with basic shell caching;
- explicit timezone handling and multi-user ownership.

It intentionally does not implement streaks, gamification, social features, subscriptions, AI, complex schedules, or full offline synchronization.

## 2. Architecture

```text
                           iPhone / browser
                     Next.js client + service worker
                                  │
                                  │ HTTPS
                                  ▼
                     Vercel Hobby / Next.js 16
                   ┌──────────────┴──────────────┐
                   │ Server Components           │
                   │ Better Auth routes          │
                   │ User-scoped application API │
                   │ Web Push delivery           │
                   └──────────────┬──────────────┘
                                  │ pooled PostgreSQL
                                  ▼
                              Neon Free
                                  ▲
                                  │ evaluates every 5 minutes
                                  │
                         Upstash QStash Free
```

The frontend and API live in one Next.js application. PostgreSQL remains the source of truth. QStash only wakes the reminder engine; it does not own reminder state.

## 3. Why the original Cloudflare architecture changed

The original specification proposed a Cloudflare-hosted frontend, a separate Worker API, Cloudflare Cron, and Neon.

The implementation uses a single Vercel deployment because:

1. The user explicitly wanted a setup that can be deployed from GitHub without registering a payment card.
2. Next.js App Router already provides server routes, rendering, authentication integration, and PWA assets in one project.
3. A separate Worker would add deployment, CORS, cookie-domain, and observability complexity without improving a personal V1.
4. Vercel Hobby cron cannot support frequent reminders: it runs at most once daily and has low timing precision.
5. QStash Free can call one signed endpoint every fifteen minutes. This uses 96 of the current 1,000 free daily messages.

The product model did not change: PostgreSQL owns data, reminders are derived from entries, all entities are scoped to a user, and historical events are preserved.

## 4. Main technology choices

| Area | Choice | Reason |
| --- | --- | --- |
| Framework | Next.js App Router + React + TypeScript | One deployable full-stack application with strong Vercel support |
| Database | PostgreSQL on Neon | Structured history, constraints, aggregation, and future LLM/tool compatibility |
| ORM/migrations | Drizzle ORM + Drizzle Kit | Typed queries and reviewable SQL migrations |
| PostgreSQL transport | `pg` pool | Works with both local PostgreSQL and Neon's pooled connection string |
| Authentication | Better Auth | Secure password hashing and database-backed sessions without custom crypto |
| Validation | Zod | Runtime validation for every write endpoint |
| Dates | date-fns + date-fns-tz | DST-safe local-day boundaries and reminder evaluation |
| Scheduling | Upstash QStash | Signed recurring delivery without relying on paid Vercel cron |
| Notifications | `web-push`, Push API, service worker | Standards-based iPhone/desktop delivery without an App Store application |
| Styling | Custom responsive CSS | Small bundle and full control over the intentionally quiet visual system |

## 5. Repository map

```text
src/
  app/
    api/
      auth/[...all]/       Better Auth handler
      data/                Date-range read model for Today/Calendar/Insights
      habits/              Habit creation and updates
      entries/             Event creation, editing, and deletion
      reminders/           Reminder configuration
      push/                Device subscription and test delivery
      cron/reminders/      Signed QStash entry point
      profile/             Timezone updates
    globals.css            Complete responsive visual system
    layout.tsx             PWA and page metadata
    manifest.ts            Web App Manifest
    page.tsx               Session-aware application entry
  components/
    auth-screen.tsx        Sign-in/sign-up experience
    habit-app.tsx          Today, Calendar, Insights, Settings, and editors
    modal.tsx              Responsive dialog/bottom-sheet primitive
    types.ts               Client response types
  db/
    index.ts               Shared PostgreSQL pool and Drizzle client
    schema.ts              Auth and application schema, indexes, constraints
  lib/
    auth.ts                Better Auth server configuration
    auth-client.ts         Browser auth client
    dates.ts               Timezone-safe date helpers
    push.ts                VAPID delivery and stale-subscription cleanup
    reminder-engine.ts     Conditional/idempotent notification evaluation
    session.ts             Session enforcement and API errors
    validation.ts          Create/update request schemas
public/
  sw.js                    Cache, push, and notification-click handling
  icon*.svg                PWA icons
drizzle/                   Committed SQL migrations and snapshots
scripts/
  setup-qstash.mjs         Creates or updates the fifteen-minute schedule
```

## 6. Data model and invariants

### Authentication tables

Better Auth owns `user`, `session`, `account`, and `verification`. Application tables reference the Better Auth string user ID.

Sessions expire after 90 days but slide forward after continued use. Password material is handled by Better Auth and never stored in frontend state or local storage.

### Habits

`habits` contains the definition and presentation metadata:

- `user_id` establishes ownership;
- `type` is constrained to boolean, quantity, duration, or count;
- non-boolean habits require a positive target and non-empty unit;
- `sort_order` controls Today and Settings ordering;
- archive is represented by `active = false` plus `archived_at`;
- `non_negotiable` marks habits the focus lock can require.

Archiving is not deletion. Existing entries remain queryable. An archived habit disappears from Today immediately but is still visible on historical dates when it existed.

### Entries

`habit_entries` represents events, not daily snapshots. Multiple numerical entries can contribute to one daily total. Boolean habits have at most one application-created event per local day.

Values must be positive. Every write first verifies ownership through the related habit. The API never accepts a `userId` from the browser.

### Reminders and push subscriptions

A reminder belongs to a habit. A device push subscription belongs directly to a user so one user can have multiple devices.

`notification_executions` has a unique constraint on `(reminder_id, scheduled_for)`. A cron retry therefore cannot send the same logical reminder twice.

### Focus lock

`user.lock_rule` chooses what unlocks distracting apps each day: `off`, `half` (at least half of today's active habits, rounded up), `nonNegotiables` (every habit with `non_negotiable`), `either`, or `both`. With no non-negotiable habit, that condition counts as met.

`user.lock_windows` is a JSON array of up to six `{ start, end }` ranges (`HH:mm`, user timezone; a range may cross midnight). Apps are locked only inside a range until the rule is met; with no ranges the lock applies all day.

The rule lives in `src/lib/focus-lock.ts` and has no server-only imports, so the Today banner and `GET /api/integration/lock` compute exactly the same answer. The app enforces nothing by itself: an iPhone Shortcut automation calls the integration route when a chosen app opens and sends the user back to Everyday while `locked` is true (see the README).

The page reads `lock_rule` and `lock_windows` from the table rather than the session, because Better Auth caches the session cookie for five minutes.

## 7. Date and timezone rules

- Database timestamps use `TIMESTAMPTZ`.
- Every user has an IANA timezone such as `Europe/Rome`.
- “Today,” daily totals, calendar membership, and reminder times are computed in that timezone.
- Local-day boundaries are converted to UTC with `date-fns-tz`; they are not calculated by truncating UTC timestamps.
- A date before a habit's `created_at` is neither success nor failure.
- A habit archived today is removed from the current Today screen, while previous days retain it.

These rules are important around midnight and daylight-saving transitions. Avoid replacing them with raw `Date#setHours()` server logic.

## 8. API and authorization

All application endpoints require a valid Better Auth session except the auth endpoints themselves, the signed QStash endpoint, and the `/api/integration/*` routes, which accept a bearer token whose SHA-256 is `INTEGRATION_TOKEN_SHA256` and act for `INTEGRATION_USER_EMAIL` only.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/data?from=&to=` | Habits, entries, and reminders for a date range |
| `GET/POST /api/habits` | List or create habits |
| `PATCH /api/habits/:id` | Edit, reorder, archive, or restore an owned habit |
| `POST /api/entries` | Create an owned habit event |
| `PATCH/DELETE /api/entries/:id` | Edit or remove an owned event |
| `POST /api/reminders` | Create a reminder for an owned habit |
| `PATCH/DELETE /api/reminders/:id` | Update or delete an owned reminder |
| `POST/DELETE /api/push/subscribe` | Register or remove the current device |
| `POST /api/push/test` | Send a test push to the current user's devices |
| `PATCH /api/profile` | Update the current user's timezone, focus-lock rule, or focus hours |
| `POST /api/cron/reminders` | QStash-signed reminder evaluation |
| `GET /api/integration/habits` | Bearer token: habits, entries, and reminders for a date range |
| `POST/DELETE /api/integration/entries` | Bearer token: log or remove an entry |
| `GET /api/integration/lock` | Bearer token: whether distracting apps are locked right now |
| `PATCH /api/integration/habits/:id` | Bearer token: set only `nonNegotiable` (a coach toggles it per training day) |

Habit update validation deliberately has no defaults. Defaults belong only to creation requests; otherwise a reorder-only patch could overwrite icon or color.

## 9. Reminder-engine behavior

QStash calls `/api/cron/reminders` every fifteen minutes. The handler verifies QStash's signature before doing work. A twenty-minute grace window prevents a slot from being missed because of scheduler jitter or a cold start.

For every enabled reminder:

1. Convert the current instant into the user's timezone.
2. Determine whether a scheduled slot is currently due.
3. Atomically claim the `(reminder, scheduled slot)` execution.
4. Load that habit's entries inside the user's current local day.
5. Derive completion: at least one event for boolean habits, or total greater than/equal to target for numerical habits.
6. Skip completed habits.
7. Send to every active subscription for the user.
8. Delete subscriptions rejected as expired by the push provider.
9. Mark the execution sent, skipped, or failed.

Repeating reminders stop naturally once the daily target is complete because every later slot re-evaluates the source-of-truth entries.

## 10. PWA and offline behavior

The Web App Manifest uses standalone display mode and maskable icons. The service worker:

- caches the application shell and successful non-API GET responses;
- uses network-first behavior;
- never caches authenticated API responses;
- displays incoming push payloads;
- opens or focuses the app after a notification click.

This is resilience, not offline-first synchronization. Writes require a connection and failed writes keep their editor open with an error. A durable offline mutation queue is future work.

On iPhone, Web Push requires iOS/iPadOS 16.4 or newer, HTTPS, installation to the Home Screen, and a permission request caused by a direct user action.

## 11. Local development

### Option A: complete Docker stack

Docker Compose is the fastest handoff path because it supplies both the production-style Next.js container and PostgreSQL:

```bash
npm run docker:up
```

The launcher creates an ignored `.env.docker` with random local credentials and VAPID keys. The app waits for PostgreSQL, applies committed migrations, and starts at <http://localhost:3000>. Data persists in the `everyday-postgres-data` volume. Full image-building, phone-access, troubleshooting, and reset instructions are in [DOCKER_SETUP.md](./DOCKER_SETUP.md).

### Option B: Neon development database

```bash
npm install
cp .env.example .env.local
npm run vapid:generate
npm run db:migrate
npm run dev
```

Fill `.env.local` before running migrations.

### Option C: database-only Docker container

```bash
docker run -d \
  --name everyday-local-db \
  -e POSTGRES_USER=everyday \
  -e POSTGRES_PASSWORD=everyday-local \
  -e POSTGRES_DB=everyday \
  -p 127.0.0.1:55432:5432 \
  postgres:17-alpine
```

Use this local connection string:

```text
postgresql://everyday:everyday-local@127.0.0.1:55432/everyday
```

Then run:

```bash
npm run db:migrate
npm run dev
```

To test on another device on the same network, set:

```env
BETTER_AUTH_TRUSTED_ORIGINS=http://192.168.x.x:3000
ALLOWED_DEV_ORIGINS=192.168.x.x
```

`ALLOWED_DEV_ORIGINS` contains hostnames only. `BETTER_AUTH_TRUSTED_ORIGINS` contains complete origins. Local-IP HTTP is suitable for responsive UI testing, but service workers and Web Push require production HTTPS.

## 12. Environment variables

| Variable | Visibility | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Server | Pooled Neon PostgreSQL URL |
| `BETTER_AUTH_SECRET` | Server | At least 32 random bytes for session/auth signing |
| `BETTER_AUTH_URL` | Server | Canonical deployed origin |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Server | Optional comma-separated extra origins |
| `ALLOWED_DEV_ORIGINS` | Build/dev | Optional hostnames allowed to load Next dev assets |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | Browser push-subscription key |
| `VAPID_PRIVATE_KEY` | Server | Web Push signing secret |
| `VAPID_SUBJECT` | Server | Valid `mailto:` contact for VAPID |
| `QSTASH_TOKEN` | Local/setup | Creates or updates the schedule |
| `QSTASH_CURRENT_SIGNING_KEY` | Server | Verifies current QStash signatures |
| `QSTASH_NEXT_SIGNING_KEY` | Server | Supports signing-key rotation |

Generate secrets with:

```bash
openssl rand -base64 32
npm run vapid:generate
```

Never commit `.env`, `.env.local`, or `.env.docker`.

## 13. Validation before merging

Run:

```bash
npm run typecheck
npm run lint
npm run build
```

When the schema changes:

```bash
npm run db:generate
```

Review the generated SQL in `drizzle/`, then test it against a disposable PostgreSQL database before committing.

There is currently no automated application test suite. Adding integration tests is a high-priority next step.

## 14. Production deployment

### Step 1: GitHub

1. Commit this repository on `main`.
2. Create a repository under a personal GitHub account.
3. Push `main`. The repository may be private.

Vercel Hobby cannot attach personal Hobby projects to repositories owned by GitHub organizations, so use a personally owned repository unless moving to a paid team later.

### Step 2: Neon

1. Create a Neon Free project without adding a payment method.
2. Copy both the pooled and direct connection strings.
3. Put them in local `.env.local` as `DATABASE_URL` and `DATABASE_URL_UNPOOLED` respectively. Runtime requests use the pooled connection; Drizzle migrations prefer the direct connection.
4. Run `npm run db:migrate` once.

Migrations should be an explicit deployment step. Do not run schema push automatically on every serverless startup.

### Step 3: VAPID and auth secrets

Generate `BETTER_AUTH_SECRET` and the VAPID pair. Keep the private values out of Git.

### Step 4: Vercel

1. Import the GitHub repository into a Vercel Hobby project.
2. Add all production variables from `.env.example`.
3. Set `BETTER_AUTH_URL` to the final `https://...vercel.app` or custom-domain URL.
4. Deploy using the standard Next.js preset.
5. If the deployment URL changes, update `BETTER_AUTH_URL` and redeploy.

The application requires the Node.js runtime for PostgreSQL and `web-push`; do not convert these routes to Edge runtime.

### Step 5: QStash

1. Create an Upstash account and open QStash Free.
2. Copy the token and both signing keys.
3. Add the signing keys to Vercel and redeploy.
4. From a trusted local shell, run:

```bash
QSTASH_TOKEN=your-token \
APP_URL=https://your-project.vercel.app \
npm run qstash:setup
```

The command creates or replaces the stable schedule ID `everyday-reminders` with `*/15 * * * *`.

### Step 6: production smoke test

Verify all of the following:

- registration, sign-in, refresh, and sign-out;
- creation of each habit type;
- boolean toggle and multiple numerical entries;
- notes and historical editing;
- archive disappearance from Today and restoration from Settings;
- habit reordering without metadata changes;
- month/year navigation and statistics;
- iPhone Home Screen installation;
- push subscription and test notification;
- conditional reminders stopping after target completion;
- QStash execution logs and notification-execution rows.

## 15. Operational considerations

- Free plans have hard limits. With one personal user, expected use is far below them.
- QStash's fifteen-minute evaluation means reminders can arrive up to about fifteen minutes after their configured time.
- The application logs push failures to the platform log and records execution status, but has no alerting dashboard yet.
- Stale push endpoints returning HTTP 404/410 are removed automatically.
- Database backups and point-in-time recovery depend on the selected Neon plan.
- `npm audit` currently reports a moderate development-only advisory through Drizzle Kit's legacy `esbuild` loader. The automated remediation proposes an incompatible downgrade and should not be applied blindly.

## 16. Known deviations and limitations

- Authentication is email/password, not username/password. Username support can be added through Better Auth without changing ownership IDs.
- Email verification and password-reset delivery are not configured because V1 deliberately has no email provider.
- The UI currently manages one reminder configuration per habit even though the database/API can store multiple reminders.
- Statistics are calculated from range data in the client. For many users or years of data, move aggregations to dedicated SQL endpoints.
- The service worker does not queue offline writes.
- PWA icons are SVG. Production polish should add dedicated 180, 192, and 512-pixel PNG assets and install screenshots.
- There is no Sentry, product analytics, CI workflow, automated backup job, or automated test suite yet.

## 17. Recommended next steps

### P0 — before relying on it daily

1. Deploy a private production instance through GitHub, Neon, Vercel, and QStash.
2. Test Web Push on the actual iPhone Home Screen installation.
3. Add API integration tests for ownership, archival history, timezone boundaries, boolean uniqueness, and notification idempotency.
4. Add a database seed command for disposable development environments.
5. Add structured server logging around cron runs and failed push delivery.

### P1 — production hardening

1. Add password reset and optional email verification through a no-card email provider or a user-controlled SMTP server.
2. Add account-level data export in JSON/CSV.
3. Add a notification-delivery history screen and retry policy for transient failures.
4. Add proper PNG icons, splash/install assets, and an explicit iPhone installation guide in the UI.
5. Add Playwright coverage for the core mobile journey.
6. Add GitHub CI running typecheck, lint, tests, and build on pull requests.

### P2 — product evolution

1. Configurable quick-add amounts per habit.
2. More than one reminder rule in the UI.
3. Complex recurring schedules while preserving “did not exist/not scheduled” semantics.
4. Durable offline mutation queue with conflict resolution.
5. Server-side statistical aggregation for long histories.
6. Explicit LLM tool endpoints with narrow authorization; never expose database credentials to an agent.

## 18. Architectural guardrails

Future changes should preserve these rules:

1. PostgreSQL remains the source of truth.
2. Historical events are not collapsed into mutable daily totals.
3. Archive instead of deleting meaningful history.
4. Every owned query is scoped from the authenticated session.
5. Timezone is explicit whenever “today” is involved.
6. Reminder delivery is conditional and idempotent.
7. Secrets remain server-side.
8. The most common recording action stays within one or two taps.
9. No streaks or gamification should be introduced accidentally through UI metrics.
10. Future AI accesses the application through explicit, auditable tools—not unrestricted SQL.
