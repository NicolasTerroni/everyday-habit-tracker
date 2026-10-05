import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { createEntry } from "@/lib/entries";
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
    const { entry, created } = await createEntry(habit, session.user.timezone || "Europe/Rome", data);
    return NextResponse.json(entry, { status: created ? 201 : 200 });
  } catch (error) {
    return apiError(error);
  }
}
