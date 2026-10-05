import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { habitEntries, habits, reminders } from "@/db/schema";
import { dayBounds } from "@/lib/dates";

// Habits, entries and reminders of one user for a local date range (inclusive).
export async function loadHabitData(userId: string, timezone: string, from: string, to: string, includeArchived: boolean) {
  const rangeStart = dayBounds(from, timezone).start;
  const rangeEnd = dayBounds(to, timezone).end;

  const userHabits = await db.select().from(habits).where(
    includeArchived
      ? eq(habits.userId, userId)
      : and(
          eq(habits.userId, userId),
          lt(habits.createdAt, rangeEnd),
          or(eq(habits.active, true), gte(habits.archivedAt, rangeStart))
        )
  ).orderBy(asc(habits.sortOrder), asc(habits.createdAt));

  if (!userHabits.length) {
    return { habits: [], entries: [], reminders: [], timezone, from, to };
  }

  const [entries, reminderRows] = await Promise.all([
    db.select({
      id: habitEntries.id,
      habitId: habitEntries.habitId,
      timestamp: habitEntries.timestamp,
      value: habitEntries.value,
      note: habitEntries.note,
      createdAt: habitEntries.createdAt,
      updatedAt: habitEntries.updatedAt
    }).from(habitEntries).innerJoin(habits, eq(habitEntries.habitId, habits.id)).where(
      and(
        eq(habits.userId, userId),
        gte(habitEntries.timestamp, rangeStart),
        lt(habitEntries.timestamp, rangeEnd)
      )
    ).orderBy(asc(habitEntries.timestamp)),
    db.select({
      id: reminders.id,
      habitId: reminders.habitId,
      enabled: reminders.enabled,
      startTime: reminders.startTime,
      endTime: reminders.endTime,
      intervalMinutes: reminders.intervalMinutes
    }).from(reminders).innerJoin(habits, eq(reminders.habitId, habits.id)).where(eq(habits.userId, userId))
  ]);

  return { habits: userHabits, entries, reminders: reminderRows, timezone, from, to };
}
