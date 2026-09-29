import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";
import { habitPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const data = habitPatch.parse(await request.json());
    const update: Record<string, unknown> = { ...data, updatedAt: new Date() };
    if (data.targetValue !== undefined) update.targetValue = data.targetValue == null ? null : String(data.targetValue);
    if (data.active === false) update.archivedAt = new Date();
    if (data.active === true) update.archivedAt = null;
    const [changed] = await db.update(habits).set(update).where(and(eq(habits.id, id), eq(habits.userId, session.user.id))).returning();
    if (!changed) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    return NextResponse.json(changed);
  } catch (error) {
    return apiError(error);
  }
}
