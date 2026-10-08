import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { habitInput, habitPatch } from "@/lib/validation";

// Creates one of the user's habits at the end of their list.
export async function createHabit(userId: string, data: z.infer<typeof habitInput>) {
  const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${habits.sortOrder}), -1) + 1` }).from(habits).where(eq(habits.userId, userId));
  const [created] = await db.insert(habits).values({
    userId,
    ...data,
    description: data.description || null,
    targetValue: data.type === "boolean" ? null : String(data.targetValue),
    unit: data.type === "boolean" ? null : data.unit || (data.type === "duration" ? "min" : data.type === "count" ? "times" : "units"),
    sortOrder: Number(next)
  }).returning();
  return created;
}

// Edits, archives (active: false) or restores one of the user's habits. Returns null when it isn't theirs.
export async function updateHabit(userId: string, id: string, data: Partial<z.infer<typeof habitPatch>>) {
  const update: Record<string, unknown> = { ...data, updatedAt: new Date() };
  if (data.targetValue !== undefined) update.targetValue = data.targetValue == null ? null : String(data.targetValue);
  if (data.active === false) update.archivedAt = new Date();
  if (data.active === true) update.archivedAt = null;
  const [changed] = await db.update(habits).set(update).where(and(eq(habits.id, id), eq(habits.userId, userId))).returning();
  return changed ?? null;
}
