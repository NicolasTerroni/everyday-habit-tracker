import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { habitEntries, habits } from "@/db/schema";
import { createEntry } from "@/lib/entries";
import { integrationError, integrationOwner } from "@/lib/integration";

export const dynamic = "force-dynamic";

const newEntry = z.object({
  habitId: z.string().uuid(),
  timestamp: z.coerce.date().optional(),
  value: z.coerce.number().positive().optional(),
  note: z.string().trim().max(1000).optional().nullable()
});

// Logs an entry for one of the account's habits (value defaults to 1, timestamp to now).
export async function POST(request: NextRequest) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const data = newEntry.parse(await request.json());
    const [habit] = await db.select().from(habits)
      .where(and(eq(habits.id, data.habitId), eq(habits.userId, owner.id), eq(habits.active, true))).limit(1);
    if (!habit) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    const { entry, created } = await createEntry(habit, owner.timezone, {
      timestamp: data.timestamp ?? new Date(),
      value: data.value ?? 1,
      note: data.note
    });
    return NextResponse.json({ ...entry, created }, { status: created ? 201 : 200 });
  } catch (err) {
    return integrationError(err);
  }
}

// Removes one of the account's entries (the bot's undo): /api/integration/entries?id=<entry id>
export async function DELETE(request: NextRequest) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get("id"));
    const [row] = await db.select({ id: habitEntries.id }).from(habitEntries)
      .innerJoin(habits, eq(habitEntries.habitId, habits.id))
      .where(and(eq(habitEntries.id, id), eq(habits.userId, owner.id))).limit(1);
    if (!row) return NextResponse.json({ error: "Entry not found" }, { status: 404 });
    await db.delete(habitEntries).where(eq(habitEntries.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return integrationError(err);
  }
}
