import { asc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";
import { habitInput } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const rows = await db.select().from(habits).where(eq(habits.userId, session.user.id)).orderBy(asc(habits.sortOrder));
    return NextResponse.json(rows);
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = habitInput.parse(await request.json());
    const [{ next }] = await db.select({ next: sql<number>`coalesce(max(${habits.sortOrder}), -1) + 1` }).from(habits).where(eq(habits.userId, session.user.id));
    const [created] = await db.insert(habits).values({
      userId: session.user.id,
      ...data,
      description: data.description || null,
      targetValue: data.type === "boolean" ? null : String(data.targetValue),
      unit: data.type === "boolean" ? null : data.unit || (data.type === "duration" ? "min" : data.type === "count" ? "times" : "units"),
      sortOrder: Number(next)
    }).returning();
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
