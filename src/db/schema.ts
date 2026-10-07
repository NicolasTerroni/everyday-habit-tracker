import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
};

// Better Auth core tables. String IDs are intentional: Better Auth owns auth IDs.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  timezone: text("timezone").default("Europe/Rome").notNull(),
  // What unlocks distracting apps each day (see src/lib/focus-lock.ts).
  lockRule: text("lock_rule", { enum: ["off", "half", "nonNegotiables", "either", "both"] }).default("off").notNull(),
  ...timestamps
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    ...timestamps
  },
  (table) => [index("session_user_id_idx").on(table.userId)]
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_unique").on(table.providerId, table.accountId)
  ]
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const habits = pgTable(
  "habits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    type: text("type", { enum: ["boolean", "quantity", "duration", "count"] }).notNull(),
    targetValue: numeric("target_value", { precision: 14, scale: 3 }),
    unit: text("unit"),
    icon: text("icon").default("✨").notNull(),
    color: text("color").default("#7565d9").notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    nonNegotiable: boolean("non_negotiable").default(false).notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps
  },
  (table) => [
    index("habits_user_active_sort_idx").on(table.userId, table.active, table.sortOrder),
    index("habits_user_created_idx").on(table.userId, table.createdAt),
    check("habits_type_check", sql`${table.type} in ('boolean', 'quantity', 'duration', 'count')`),
    check("habits_target_check", sql`(${table.type} = 'boolean' and ${table.targetValue} is null) or (${table.type} <> 'boolean' and ${table.targetValue} > 0 and length(${table.unit}) > 0)`)
  ]
);

export const habitEntries = pgTable(
  "habit_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    value: numeric("value", { precision: 14, scale: 3 }).notNull(),
    note: text("note"),
    ...timestamps
  },
  (table) => [
    index("entries_habit_timestamp_idx").on(table.habitId, table.timestamp),
    index("entries_timestamp_idx").on(table.timestamp),
    check("entries_positive_value_check", sql`${table.value} > 0`)
  ]
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    habitId: uuid("habit_id").notNull().references(() => habits.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(true).notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time"),
    intervalMinutes: integer("interval_minutes"),
    ...timestamps
  },
  (table) => [
    index("reminders_habit_enabled_idx").on(table.habitId, table.enabled),
    check("reminders_interval_check", sql`${table.intervalMinutes} is null or ${table.intervalMinutes} between 15 and 1440`),
    check("reminders_repeat_end_check", sql`${table.intervalMinutes} is null or ${table.endTime} is not null`)
  ]
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("push_endpoint_unique").on(table.endpoint),
    index("push_user_idx").on(table.userId)
  ]
);

export const notificationExecutions = pgTable(
  "notification_executions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reminderId: uuid("reminder_id").notNull().references(() => reminders.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status", { enum: ["processing", "sent", "failed", "skipped"] }).notNull(),
    ...timestamps
  },
  (table) => [
    uniqueIndex("notification_reminder_slot_unique").on(table.reminderId, table.scheduledFor),
    check("notification_status_check", sql`${table.status} in ('processing', 'sent', 'failed', 'skipped')`)
  ]
);

export type Habit = typeof habits.$inferSelect;
export type HabitEntry = typeof habitEntries.$inferSelect;
