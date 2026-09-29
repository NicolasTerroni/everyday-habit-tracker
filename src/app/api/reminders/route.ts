import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits, reminders } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";
import { reminderInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = reminderInput.parse(await request.json());
    const [habit] = await db.select({ id: habits.id }).from(habits).where(and(eq(habits.id, data.habitId), eq(habits.userId, session.user.id))).limit(1);
    if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    const [created] = await db.insert(reminders).values(data).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
