import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits, reminders } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";
import { reminderPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function ownedReminder(id: string, userId: string) {
  const [row] = await db.select({ id: reminders.id }).from(reminders)
    .innerJoin(habits, eq(reminders.habitId, habits.id))
    .where(and(eq(reminders.id, id), eq(habits.userId, userId))).limit(1);
  return row;
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!await ownedReminder(id, session.user.id)) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    const data = reminderPatch.parse(await request.json());
    const [changed] = await db.update(reminders).set({ ...data, updatedAt: new Date() }).where(eq(reminders.id, id)).returning();
    return NextResponse.json(changed);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!await ownedReminder(id, session.user.id)) return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    await db.delete(reminders).where(eq(reminders.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
