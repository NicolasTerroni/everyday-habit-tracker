La idea central es: PWA mobile-first, privada, un usuario inicialmente, pero multi-user-ready desde el modelo de datos; historial como fuente de verdad; Web Push como feature de primera clase; sin streaks ni LLM todavía.

Personal Habit Tracker — Technical Specification V1

1. Product definition

A private, mobile-first habit tracking Progressive Web App (PWA) designed for personal daily use.

The application must make it extremely fast to:

1. Open the app.
2. See today’s habits.
3. Record progress.
4. Add notes when useful.
5. Receive reminders only when a habit is still incomplete.
6. Review historical behavior through monthly/yearly calendars.
7. Analyze patterns through statistics.

The application is initially for one user, but the architecture must support multiple users without redesigning the data model.

The system must be designed so that a future LLM can query and reason over the user’s structured historical data without requiring a major architectural rewrite.

⸻

2. Product principles

2.1 Today is the primary experience

The main screen is always the current day.

The application should answer:

“What do I need to do today, and what have I already done?”

2.2 Historical data is first-class

The application is not primarily a streak tracker.

There are no streaks in V1.

The primary purpose is to build a reliable historical record of behavior.

2.3 Never destroy useful historical information

Deleting a habit should normally mean archiving it, not physically deleting its historical records.

A habit that did not exist yet must not appear as a failed habit in historical statistics.

2.4 Fast interaction

Common actions should require one or two taps.

The user should not have to navigate through forms to record:

* “I went to the gym.”
* “+500 ml water.”
* “+20 minutes reading.”

2.5 Notifications are a core feature

Notifications are not an optional later addition.

The reminder system must be designed together with the habit and entry models.

⸻

3. Technology stack

Frontend

* React
* TypeScript
* Next.js
* PWA
* Mobile-first responsive UI

The application must support installation on iPhone through Safari’s “Add to Home Screen”.

The application should behave as a standalone application once installed.

Backend

* Cloudflare Workers
* TypeScript

The Worker exposes the application’s API and handles:

* authentication integration
* habit operations
* habit entry operations
* statistics queries
* notification scheduling/evaluation
* push notification delivery
* authorization

Database

* Neon PostgreSQL

PostgreSQL is the source of truth for:

* users
* authentication-related data
* habits
* entries
* notes
* reminders
* push subscriptions

Authentication

* Better Auth
* Email/username + password
* Persistent sessions
* Secure password hashing handled by Better Auth

The user should normally log in once and remain authenticated for a long period.

Use renewable/sliding sessions rather than requiring frequent login.

Target behavior:

The user can use the application daily for months without manually logging in again.

A session may still expire after a long period of inactivity or explicit logout.

Push notifications

* Web Push
* Service Worker
* Push API
* Notifications API

The user must install the PWA on the iPhone and grant notification permission.

No App Store application is required for V1.

Scheduled jobs

Initially:

* Cloudflare Cron

Do not introduce Redis/QStash unless the notification workload actually requires it.

Storage

No object storage in V1.

Cloudflare R2 can be introduced later if images or attachments are required.

Analytics

Not required for V1.

PostHog can be added later.

Error monitoring

Sentry may be added from the beginning.

⸻

4. High-level architecture

                         INTERNET
                            │
                            ▼
                 ┌─────────────────────┐
                 │     Cloudflare      │
                 │ DNS / Edge / HTTPS  │
                 └──────────┬──────────┘
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Next.js / PWA    │
                 │   React + TypeScript│
                 └──────────┬──────────┘
                            │ HTTPS
                            ▼
                 ┌─────────────────────┐
                 │  Cloudflare Worker  │
                 │       API           │
                 └───────┬───────┬─────┘
                         │       │
                 ┌───────▼───┐   │
                 │   Neon    │   │
                 │ PostgreSQL│   │
                 └───────────┘   │
                                 │
                         ┌───────▼────────┐
                         │ Cloudflare     │
                         │ Cron            │
                         └───────┬────────┘
                                 │
                                 ▼
                         Notification logic
                                 │
                                 ▼
                         Web Push service
                                 │
                                 ▼
                         ┌──────────────┐
                         │    iPhone    │
                         │ Habit Tracker│
                         └──────────────┘

⸻

5. Authentication

User model

The application must have a real users table.

Even though V1 is for one person, every application-owned entity must ultimately belong to a user.

Example:

users
  id
  email
  name
  created_at
  updated_at

Better Auth owns/extends the authentication-specific tables required by its implementation.

Do not implement password hashing manually.

⸻

6. Sessions

Authentication should use secure persistent sessions.

Desired UX:

First visit
    ↓
Login
    ↓
Session created
    ↓
Use application
    ↓
Close application
    ↓
Open next day
    ↓
Still authenticated

The session should use secure cookies and appropriate:

* HttpOnly
* Secure
* SameSite

settings.

The frontend should not store passwords or authentication secrets in localStorage.

The user should have an explicit logout action.

⸻

7. Habit model

A habit represents something the user wants to track.

Each habit must contain at least:

id
user_id
name
description
type
target_value
unit
active
created_at
updated_at
archived_at

Potential additional fields:

icon
color
sort_order

These are UX fields and can be introduced from the beginning.

⸻

8. Habit types

V1 supports four conceptual habit types.

8.1 Boolean

Example:

Meditation

State:

completed / not completed

The underlying entry may have:

value = 1

⸻

8.2 Quantity

Example:

Water
Target: 2500 ml

Entries:

500 ml
250 ml
500 ml
...

The daily total is calculated from the entries.

⸻

8.3 Duration

Example:

Reading
Target: 30 minutes

Entries:

20 min
15 min

Daily total:

35 / 30 minutes

⸻

8.4 Count

Example:

Fruit
Target: 3

Entries:

1
1
1

Daily total:

3 / 3

⸻

9. Internal representation

Quantity, duration and count should share a common numerical representation where possible.

Conceptually:

value
unit

Examples:

500 + ml
30 + minutes
3 + times

This allows the system to remain extensible.

Future units could include:

km
hours
pages
glasses
repetitions

without changing the fundamental architecture.

⸻

10. Habit schedules

V1 intentionally does NOT implement complex weekly schedules.

The application is a daily tracker.

If a habit exists and is active, it appears as a daily habit.

Example:

Gym

appears every day.

The user can simply mark:

Monday    ✓
Tuesday   ○
Wednesday ✓
Thursday  ○
Friday    ○
Saturday  ✓
Sunday    ○

This makes historical patterns easy to visualize.

Complex recurring schedules can be introduced later without changing the underlying entry model.

⸻

11. Habit lifecycle

Habits must not normally be hard-deleted.

Example:

Gym
created_at = 2026-09-01
archived_at = NULL

If archived:

active = false
archived_at = 2026-10-15

Historical entries remain.

Historical behavior therefore remains queryable.

⸻

12. Habit entries

This is the most important data model after habits.

A habit_entry represents an actual event/measurement performed by the user.

Example:

habit_entries
id
habit_id
timestamp
value
note
created_at
updated_at

Examples:

Gym
2026-09-29 18:42
value = 1
Reading
2026-09-29 21:15
value = 35
Water
2026-09-29 09:12
value = 500
Water
2026-09-29 12:20
value = 500

⸻

13. Why entries are events rather than daily states

Do not store only:

water_today = 2500

Store:

09:10 → 500
11:30 → 500
14:20 → 500
17:10 → 500
20:00 → 500

The application can derive:

daily_total = SUM(entries.value)

This preserves much more information.

It enables future questions such as:

“What time do I usually drink water?”

or:

“How much water did I drink before noon?”

or:

“Did my reading duration change over the last six months?”

⸻

14. Boolean habit timestamps

Boolean habits should also store the completion timestamp.

Example:

Gym
completed_at = 2026-09-29 18:42

This enables future time-based analysis.

⸻

15. Notes

Notes should be associated with individual entries.

Example:

Reading
35 minutes
Note:
"Much easier to concentrate today."

For boolean habits:

Gym
Completed
Note:
"Good workout. Increased pull-ups."

The UI should expose notes through the habit’s three-dot menu.

V1 does not need a separate global notes application.

⸻

16. Today screen

This is the primary screen.

Example:

Tuesday
September 29
TODAY
🏋️ Gym                         ⋮
○ Not completed
📚 Reading                      ⋮
32 / 30 min
🇮🇹 Italian                     ⋮
○ Not completed
💧 Water                        ⋮
1.75 / 2.50 L                  +
🧘 Meditation                   ⋮
✓ Completed
                         ＋

⸻

17. Today interactions

Boolean

Tap:

○

becomes:

✓

A corresponding entry is created.

Tap again to undo.

The application should not simply mutate a daily boolean state if doing so would destroy historical event information.

⸻

Quantity / duration / count

Provide a quick + action.

Example:

Water
1.75 / 2.50 L              +

Pressing + opens a lightweight input.

Possible UX:

+250 ml
+500 ml
Custom

The exact quick increments should be configurable later.

⸻

18. Habit menu

Each habit has a three-dot menu:

⋮
Edit habit
Add note
View history
Reminder settings
Archive habit

Potential future actions:

Duplicate
Delete
Change icon
Change color

⸻

19. Creating a habit

The user presses:

+

and sees:

Create Habit
Name
[________________]
Type
○ Boolean
○ Quantity
○ Duration
○ Count
Target
[________]
Unit
[________]
Reminder
☐ Enable
[Create]

For Boolean habits, target/unit are unnecessary.

For quantitative habits:

Water
Type: Quantity
Target: 2500
Unit: ml

⸻

20. Calendar

Second primary screen.

The calendar must support:

* Month view
* Year view
* Habit filters

⸻

21. Month view

Example:

September 2026
[ Month ] [ Year ]
Filters
☑ Gym
☑ Reading
☐ Italian
☑ Water
MON TUE WED THU FRI SAT SUN
 31   1   2   3   4   5   6
  7   8   9  10  11  12  13
 14  15  16  17  18  19  20
 21  22  23  24  25  26  27
 28  29  30

Each day should visually communicate the filtered habits’ state.

For example:

✓ completed
○ not completed
— habit did not exist

For quantitative habits, use an appropriate visual representation.

⸻

22. Historical editing

Selecting a previous day opens that day’s habit state.

The user must be able to:

* mark a boolean habit
* add/remove quantitative entries
* change values
* add notes

Historical records should be editable.

⸻

23. Year view

The year view provides a high-level behavioral overview.

Example:

2026
January
████████████████
February
██████████████
March
████████████████
...

The year view must support filtering by habit.

The goal is pattern recognition rather than detailed daily interaction.

⸻

24. Calendar semantics

Important distinction:

Habit did not exist

—

This is not a failure.

Habit existed and was not completed

○

Habit completed

✓

Quantitative habit

Show progress relative to target.

Example:

1750 / 2500 ml

⸻

25. Statistics

Third primary screen.

V1 statistics should focus on descriptive historical information.

No streak calculations.

Possible metrics:

Overall completion

September
82%

Per habit

Gym          12 / 29
Reading      24 / 29
Italian      18 / 29
Meditation   21 / 29

By weekday

Monday       82%
Tuesday      76%
Wednesday    91%
Thursday     63%
Friday       71%
Saturday     88%
Sunday       55%

Quantitative habits

Examples:

Water
Average: 2.1 L/day
Target: 2.5 L/day
Weekly average
...
Reading
Average: 31 min/day
Target: 30 min/day

⸻

26. Notifications

Notifications are a first-class feature.

Every habit can optionally have one or more reminder configurations.

A reminder has conceptually:

id
habit_id
enabled
start_time
end_time
interval
type
created_at
updated_at

⸻

27. Reminder behavior

A reminder is conditional.

The system must ask:

“Is this habit still incomplete?”

before sending the notification.

Example:

Gym
Reminder:
20:00
Condition:
daily target not completed

At 20:00:

Gym incomplete?
YES → send push
NO  → do nothing

⸻

28. Repeating reminders

Some habits may have repeated reminders.

Example:

Water
Start: 09:00
End: 21:00
Every: 3 hours

Potential reminders:

09:00
12:00
15:00
18:00
21:00

However, once the target is reached:

2500 / 2500 ml

future reminders should stop.

⸻

29. Push subscription model

Each browser/device installation can have a push subscription.

Conceptually:

push_subscriptions
id
user_id
endpoint
p256dh
auth
created_at
updated_at
last_seen_at

A user can eventually have multiple devices.

Example:

User
 ├── iPhone PWA
 └── Desktop browser

V1 can still support multiple subscriptions even if only one device is used.

⸻

30. Push notification flow

Cloudflare Cron
      ↓
Find enabled reminders
      ↓
Find today's habit state
      ↓
Is target incomplete?
      ↓
YES
      ↓
Load user's push subscription
      ↓
Send Web Push
      ↓
iPhone notification

The application should avoid sending duplicate notifications for the same scheduled reminder.

A notification execution/log model may be added to guarantee idempotency.

⸻

31. Notification idempotency

The notification system must be designed so that the same reminder is not accidentally sent multiple times if a cron execution is retried.

Conceptually:

notification_executions
id
reminder_id
scheduled_for
sent_at
status

A unique constraint such as:

(reminder_id, scheduled_for)

can prevent duplicate execution.

This is particularly important because the backend scheduler should be treated as potentially retryable.

⸻

32. Notification permission UX

The application should NOT request notification permission immediately upon first page load.

Instead:

1. User creates a habit.
2. User enables a reminder.
3. Application explains that notifications are required.
4. User grants notification permission.
5. Browser creates push subscription.
6. Subscription is stored against the user.

This should make the permission request contextual.

⸻

33. Offline behavior

V1 should have basic resilience.

The application should remain usable if the network briefly disappears.

At minimum:

* cached application shell
* clear offline state
* avoid silently losing user input

A full offline-first synchronization engine is not required for V1.

However, the architecture should not make future offline support impossible.

⸻

34. API structure

Conceptual API:

POST   /api/auth/...
GET    /api/me
GET    /api/habits
POST   /api/habits
PATCH  /api/habits/:id
POST   /api/habits/:id/archive
GET    /api/habits/:id/entries
POST   /api/habits/:id/entries
PATCH  /api/entries/:id
DELETE /api/entries/:id
GET    /api/calendar
GET    /api/statistics
GET    /api/reminders
POST   /api/reminders
PATCH  /api/reminders/:id
DELETE /api/reminders/:id
POST   /api/push/subscribe
DELETE /api/push/subscribe
POST   /api/push/test

All non-public endpoints require authentication.

⸻

35. Authorization

Every query must be scoped by authenticated user.

Conceptually:

SELECT *
FROM habits
WHERE id = ?
AND user_id = current_user_id;

Never trust a user_id supplied by the frontend.

The backend obtains the authenticated user from the session.

This applies to:

* habits
* entries
* notes
* reminders
* push subscriptions
* statistics
* calendar queries

⸻

36. Database relationships

Core relationship:

users
  │
  ├───────────────┐
  │               │
  ▼               ▼
habits       push_subscriptions
  │
  ├───────────────┐
  │               │
  ▼               ▼
entries       reminders
  │
  ▼
notes

A note may be implemented directly on an entry in V1 rather than requiring a separate table.

⸻

37. Proposed database schema

users

id UUID PK
email TEXT UNIQUE NOT NULL
name TEXT
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL

Better Auth-specific columns/tables should follow Better Auth’s recommended schema rather than being reinvented.

habits

id UUID PK
user_id UUID FK users(id)
name TEXT NOT NULL
description TEXT
type TEXT NOT NULL
target_value NUMERIC
unit TEXT
icon TEXT
color TEXT
sort_order INTEGER
active BOOLEAN NOT NULL DEFAULT true
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
archived_at TIMESTAMPTZ

habit_entries

id UUID PK
habit_id UUID FK habits(id)
timestamp TIMESTAMPTZ NOT NULL
value NUMERIC NOT NULL
note TEXT
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL

reminders

id UUID PK
habit_id UUID FK habits(id)
enabled BOOLEAN NOT NULL
start_time TIME
end_time TIME
interval_minutes INTEGER
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL

push_subscriptions

id UUID PK
user_id UUID FK users(id)
endpoint TEXT UNIQUE NOT NULL
p256dh TEXT NOT NULL
auth TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL
updated_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ

notification_executions

id UUID PK
reminder_id UUID FK reminders(id)
scheduled_for TIMESTAMPTZ NOT NULL
sent_at TIMESTAMPTZ
status TEXT NOT NULL
created_at TIMESTAMPTZ NOT NULL

Unique:

(reminder_id, scheduled_for)

⸻

38. Important data-model decision: timezone

The application must explicitly store the user’s timezone.

Example:

users.timezone

Initial value:

Europe/Madrid

This is important because reminders and “today” depend on local time.

Do not rely exclusively on UTC when calculating:

* current day
* daily totals
* calendar dates
* reminder times

Store timestamps in UTC where appropriate, but interpret them using the user’s configured timezone.

⸻

39. Future LLM compatibility

The architecture must remain LLM-friendly without implementing the LLM in V1.

The LLM should eventually be able to access structured information such as:

Habit
Entry
Date
Timestamp
Value
Unit
Note

This allows future capabilities:

"What did I do yesterday?"
"How consistent was I with reading in September?"
"What habits do I usually miss on Sundays?"
"How much water did I drink last week?"
"Summarize my September."
"Create a habit to read 30 minutes every day."

The future LLM should access the application through explicit APIs/tools rather than directly modifying the database.

Example future architecture:

                LLM Agent
                    │
              Tool/API layer
                    │
                    ▼
             Habit Tracker API
                    │
                    ▼
                PostgreSQL

The LLM must never directly receive unrestricted database credentials.

⸻

40. No streaks in V1

Do not implement:

* streak counters
* streak freezes
* streak rewards
* streak badges

The underlying historical model must nevertheless make streak calculations possible later.

⸻

41. No gamification in V1

Do not implement:

* XP
* levels
* achievements
* leaderboards
* points

The product should focus on accurate personal tracking.

⸻

42. No complex social features

V1 has:

* one user
* private data
* no sharing
* no friends
* no teams

The database remains multi-user-ready.

⸻

43. Security requirements

Minimum requirements:

* HTTPS only
* secure authentication
* password hashing through Better Auth
* secure session cookies
* authenticated API routes
* user-scoped database queries
* no secrets in frontend code
* environment variables for credentials
* Web Push private keys stored server-side
* database credentials never exposed to client

⸻

44. Environment configuration

Development:

DATABASE_URL
BETTER_AUTH_SECRET
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
NEXT_PUBLIC_VAPID_PUBLIC_KEY

Production secrets must be stored using the deployment platform’s secret-management mechanism.

⸻

45. Deployment

Target architecture:

Git repository
      │
      ▼
CI/CD
      │
      ├── Frontend → Cloudflare
      │
      └── Worker → Cloudflare Workers
Neon
 └── Production PostgreSQL

The exact frontend hosting configuration can be decided during implementation based on the selected Next.js/Cloudflare deployment approach.

⸻

46. Development phases

Phase 0 — Project setup

* repository
* TypeScript
* Next.js
* PWA configuration
* Cloudflare setup
* Neon database
* migrations
* Better Auth
* environment configuration

Deliverable:

Can register/login/logout.

⸻

Phase 1 — Habit CRUD

Implement:

* create habit
* edit habit
* archive habit
* restore habit
* list habits
* ordering

Deliverable:

I can configure my habit list.

⸻

Phase 2 — Today

Implement:

* today’s date
* boolean completion
* quantity entries
* duration entries
* count entries
* quick actions
* undo
* historical entry timestamps
* notes

Deliverable:

I can use this every day to record my habits.

⸻

Phase 3 — Calendar

Implement:

* month
* year
* habit filtering
* daily status
* historical editing

Deliverable:

I can visually understand my past behavior.

⸻

Phase 4 — Notifications

Implement:

* service worker
* Web Push
* push subscription
* reminder CRUD
* Cloudflare Cron
* conditional reminder evaluation
* repeating reminders
* notification idempotency
* test notification

Deliverable:

My phone reminds me when I haven't completed a habit.

This phase should be considered critical, not optional.

⸻

Phase 5 — Statistics

Implement:

* overall completion
* per-habit completion
* weekday patterns
* quantity averages
* daily/weekly/monthly aggregation
* basic charts

Deliverable:

I can analyze my behavior.

⸻

Phase 6 — Polish

* loading states
* empty states
* error handling
* offline indicators
* mobile UX
* dark mode
* accessibility
* animations
* performance
* PWA install UX

⸻

47. V1 acceptance criteria

The application is considered successful when:

Authentication

* User can create an account.
* User can log in.
* User remains authenticated for a long period.
* User can log out.

Habits

* User can create unlimited habits within practical limits.
* User can choose the habit type.
* User can edit habits.
* User can archive habits.
* Historical entries survive archival.

Today

* Today is the default screen.
* Boolean habits can be completed with one tap.
* Quantitative habits can receive quick increments.
* User can add notes.
* User can undo/edit entries.

Calendar

* Month view works.
* Year view works.
* Habits can be filtered.
* Historical days can be inspected and edited.
* Non-existent historical habits are not shown as failures.

Notifications

* User can enable reminders per habit.
* User can specify reminder time.
* User can specify repeated reminders.
* Notifications are sent only when the habit remains incomplete.
* Quantitative habits stop reminding once their target is reached.
* Duplicate notifications are prevented.
* Notifications appear on the iPhone PWA.

Statistics

* User can inspect historical completion.
* User can see patterns by weekday.
* Quantitative habits have useful averages/totals.

Architecture

* All user-owned data is scoped to user_id.
* PostgreSQL is the source of truth.
* Historical entries are preserved.
* No business logic depends on the frontend.
* Future LLM integration can use the existing API.

⸻

48. Explicitly out of scope for V1

Do NOT build:

* streaks
* gamification
* social features
* subscriptions
* payments
* multiple organizations
* AI assistant
* Obsidian integration
* WhatsApp integration
* Telegram integration
* email reminders
* native iOS app
* App Store distribution
* complex offline synchronization
* file/image storage
* advanced recurring schedules

These can be added later.

⸻

49. Final architecture

The V1 architecture is therefore:

                           ┌──────────────────┐
                           │      iPhone      │
                           │                  │
                           │   PWA / React    │
                           │                  │
                           │ Service Worker   │
                           └────────┬─────────┘
                                    │
                         HTTPS / Web Push
                                    │
                    ┌───────────────▼──────────────┐
                    │          Cloudflare           │
                    │                              │
                    │       Next.js / Frontend     │
                    │                              │
                    │       Cloudflare Worker      │
                    │            API               │
                    │                              │
                    │       Cloudflare Cron        │
                    └───────────────┬──────────────┘
                                    │
                                    │
                         ┌──────────▼─────────┐
                         │       Neon         │
                         │    PostgreSQL      │
                         │                    │
                         │ users              │
                         │ habits             │
                         │ habit_entries      │
                         │ reminders          │
                         │ push_subscriptions │
                         │ notification_logs  │
                         └────────────────────┘
Future:
                         ┌──────────────────┐
                         │    LLM Agent     │
                         └────────┬─────────┘
                                  │
                             Tool/API
                                  │
                                  ▼
                         Habit Tracker API
                                  │
                                  ▼
                              PostgreSQL

Core architectural principle

PostgreSQL is the source of truth.

The UI is a representation of the data.

Notifications are derived from the data.

Statistics are derived from the data.

The future LLM will reason over the data.

Nothing important should exist only in the frontend.

This gives the application a very clean evolution path:

V1
Habit Tracker
       ↓
V2
Advanced Analytics
       ↓
V3
LLM Personal Coach / Wiki
       ↓
V4
Personal Operating System

The first version should nevertheless remain small: build the daily tracking experience exceptionally well before adding intelligence.

Mi recomendación para seguir

No empezaría todavía a escribir código a ciegas. El siguiente paso debería ser convertir esta spec en el diseño técnico ejecutable:

1. ERD exacto de PostgreSQL — tablas, columnas, tipos, índices, constraints y relaciones.
2. API contract — endpoints, request/response y autorización.
3. Estructura del proyecto — carpetas y responsabilidades frontend/backend.
4. Notification engine — especialmente la lógica de every 3 hours + stop when target reached + idempotency.
5. Wireframe de las 3 pantallas principales.
6. Recién después: crear el repo y empezar a implementar Phase 0.

Para este proyecto, el punto 4 es especialmente importante: las notificaciones son suficientemente centrales como para diseñarlas antes de implementar la UI, no agregarlas al final.
