import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { habitEntries, habits, notificationExecutions, reminders, user } from "@/db/schema";
import { dateAtLocalTime, dayBounds, minuteIn, todayIn } from "@/lib/dates";
import { sendPushToUser } from "@/lib/push";

const REMINDER_GRACE_MINUTES = 20;

function minutes(value: string) {
  const [hours, mins] = value.split(":").map(Number);
  return hours * 60 + mins;
}

function timeFromMinutes(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export async function runReminderEngine(now = new Date()) {
  const rows = await db.select({
    reminderId: reminders.id,
    startTime: reminders.startTime,
    endTime: reminders.endTime,
    intervalMinutes: reminders.intervalMinutes,
    habitId: habits.id,
    habitName: habits.name,
    habitType: habits.type,
    targetValue: habits.targetValue,
    habitUnit: habits.unit,
    userId: habits.userId,
    timezone: user.timezone
  }).from(reminders)
    .innerJoin(habits, eq(reminders.habitId, habits.id))
    .innerJoin(user, eq(habits.userId, user.id))
    .where(and(eq(reminders.enabled, true), eq(habits.active, true)));

  let sent = 0;
  let due = 0;
  for (const row of rows) {
    const date = todayIn(row.timezone);
    const currentMinute = minutes(minuteIn(now, row.timezone));
    const start = minutes(row.startTime);
    const end = row.endTime ? minutes(row.endTime) : start;
    if (currentMinute < start || currentMinute > end + REMINDER_GRACE_MINUTES) continue;

    const interval = row.intervalMinutes || 1440;
    const slotMinute = start + Math.floor((Math.min(currentMinute, end) - start) / interval) * interval;
    if (slotMinute < start || slotMinute > end || currentMinute - slotMinute > REMINDER_GRACE_MINUTES) continue;
    const scheduledFor = dateAtLocalTime(date, timeFromMinutes(slotMinute), row.timezone);

    const [claim] = await db.insert(notificationExecutions).values({
      reminderId: row.reminderId,
      scheduledFor,
      status: "processing"
    }).onConflictDoNothing().returning();
    if (!claim) continue;
    due++;

    try {
      const bounds = dayBounds(date, row.timezone);
      const [{ total, count }] = await db.select({
        total: sql<string>`coalesce(sum(${habitEntries.value}), 0)`,
        count: sql<number>`count(*)`
      }).from(habitEntries).where(and(
        eq(habitEntries.habitId, row.habitId),
        gte(habitEntries.timestamp, bounds.start),
        lt(habitEntries.timestamp, bounds.end)
      ));
      const completed = row.habitType === "boolean" ? Number(count) > 0 : Number(total) >= Number(row.targetValue || 0);
      if (completed) {
        await db.update(notificationExecutions).set({ status: "skipped", updatedAt: new Date() }).where(eq(notificationExecutions.id, claim.id));
        continue;
      }
      const countSent = await sendPushToUser(row.userId, {
        title: row.habitName,
        body: row.habitType === "boolean"
          ? "Still waiting for you today."
          : `${Number(total).toLocaleString()} / ${Number(row.targetValue).toLocaleString()} ${row.habitUnit || ""}`.trim(),
        url: "/",
        tag: `habit-${row.habitId.slice(0, 20)}`
      });
      sent += countSent;
      await db.update(notificationExecutions).set({
        status: countSent ? "sent" : "skipped",
        sentAt: countSent ? new Date() : null,
        updatedAt: new Date()
      }).where(eq(notificationExecutions.id, claim.id));
    } catch (error) {
      console.error("Reminder execution failed", error);
      await db.update(notificationExecutions).set({ status: "failed", updatedAt: new Date() }).where(eq(notificationExecutions.id, claim.id));
    }
  }
  return { checked: rows.length, due, sent };
}
