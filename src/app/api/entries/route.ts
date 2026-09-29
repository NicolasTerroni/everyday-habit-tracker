import { and, eq, gte, lt } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habitEntries, habits } from "@/db/schema";
import { dateIn, dayBounds } from "@/lib/dates";
import { apiError, requireSession } from "@/lib/session";
import { entryInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = entryInput.parse(await request.json());
    const [habit] = await db.select().from(habits).where(and(eq(habits.id, data.habitId), eq(habits.userId, session.user.id))).limit(1);
    if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    if (data.timestamp < habit.createdAt) return NextResponse.json({ error: "The habit did not exist on that date" }, { status: 400 });

    if (habit.type === "boolean") {
      const timezone = session.user.timezone || "Europe/Rome";
      const bounds = dayBounds(dateIn(data.timestamp, timezone), timezone);
      const [existing] = await db.select().from(habitEntries).where(and(
        eq(habitEntries.habitId, habit.id),
        gte(habitEntries.timestamp, bounds.start),
        lt(habitEntries.timestamp, bounds.end)
      )).limit(1);
      if (existing) {
        if (data.note !== undefined) {
          const [updated] = await db.update(habitEntries).set({ note: data.note || null, updatedAt: new Date() }).where(eq(habitEntries.id, existing.id)).returning();
          return NextResponse.json(updated);
        }
        return NextResponse.json(existing);
      }
    }

    const [created] = await db.insert(habitEntries).values({
      habitId: habit.id,
      timestamp: data.timestamp,
      value: String(data.value),
      note: data.note || null
    }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
