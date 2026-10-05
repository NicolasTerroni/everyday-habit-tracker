import { and, eq, gte, lt } from "drizzle-orm";
import { db } from "@/db";
import { habitEntries, habits } from "@/db/schema";
import { dateIn, dayBounds } from "@/lib/dates";

type Habit = typeof habits.$inferSelect;
type NewEntry = { timestamp: Date; value: number; note?: string | null };

// Adds an entry. A boolean habit keeps one entry per local day: a second one only updates the note.
export async function createEntry(habit: Habit, timezone: string, data: NewEntry) {
  if (data.timestamp < habit.createdAt) throw new Error("The habit did not exist on that date");

  if (habit.type === "boolean") {
    const bounds = dayBounds(dateIn(data.timestamp, timezone), timezone);
    const [existing] = await db.select().from(habitEntries).where(and(
      eq(habitEntries.habitId, habit.id),
      gte(habitEntries.timestamp, bounds.start),
      lt(habitEntries.timestamp, bounds.end)
    )).limit(1);
    if (existing) {
      if (data.note !== undefined) {
        const [updated] = await db.update(habitEntries).set({ note: data.note || null, updatedAt: new Date() }).where(eq(habitEntries.id, existing.id)).returning();
        return { entry: updated, created: false };
      }
      return { entry: existing, created: false };
    }
  }

  const [created] = await db.insert(habitEntries).values({
    habitId: habit.id,
    timestamp: data.timestamp,
    value: String(data.value),
    note: data.note || null
  }).returning();
  return { entry: created, created: true };
}
