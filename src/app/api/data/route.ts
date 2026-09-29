import { and, asc, eq, gte, lt, or } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habitEntries, habits, reminders } from "@/db/schema";
import { dayBounds, todayIn } from "@/lib/dates";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const timezone = session.user.timezone || "Europe/Rome";
    const from = request.nextUrl.searchParams.get("from") || todayIn(timezone);
    const to = request.nextUrl.searchParams.get("to") || from;
    const rangeStart = dayBounds(from, timezone).start;
    const rangeEnd = dayBounds(to, timezone).end;

    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
    const userHabits = await db.select().from(habits).where(
      includeArchived
        ? eq(habits.userId, session.user.id)
        : and(
            eq(habits.userId, session.user.id),
            lt(habits.createdAt, rangeEnd),
            or(eq(habits.active, true), gte(habits.archivedAt, rangeStart))
          )
    ).orderBy(asc(habits.sortOrder), asc(habits.createdAt));

    const ids = userHabits.map((habit) => habit.id);
    if (!ids.length) {
      return NextResponse.json({ habits: [], entries: [], reminders: [], timezone, from, to });
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
          eq(habits.userId, session.user.id),
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
      }).from(reminders).innerJoin(habits, eq(reminders.habitId, habits.id)).where(eq(habits.userId, session.user.id))
    ]);

    return NextResponse.json({ habits: userHabits, entries, reminders: reminderRows, timezone, from, to });
  } catch (error) {
    return apiError(error);
  }
}
