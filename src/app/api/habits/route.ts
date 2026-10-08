import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { createHabit } from "@/lib/habits";
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
    return NextResponse.json(await createHabit(session.user.id, data), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
