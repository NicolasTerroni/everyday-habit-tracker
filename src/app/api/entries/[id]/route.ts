import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habitEntries, habits } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";
import { entryPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function ownedEntry(id: string, userId: string) {
  const [row] = await db.select({ id: habitEntries.id }).from(habitEntries)
    .innerJoin(habits, eq(habitEntries.habitId, habits.id))
    .where(and(eq(habitEntries.id, id), eq(habits.userId, userId))).limit(1);
  return row;
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!await ownedEntry(id, session.user.id)) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    const data = entryPatch.parse(await request.json());
    const [changed] = await db.update(habitEntries).set({
      ...data,
      value: data.value === undefined ? undefined : String(data.value),
      updatedAt: new Date()
    }).where(eq(habitEntries.id, id)).returning();
    return NextResponse.json(changed);
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    if (!await ownedEntry(id, session.user.id)) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    await db.delete(habitEntries).where(eq(habitEntries.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
