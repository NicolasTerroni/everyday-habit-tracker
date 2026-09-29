import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    const { timezone } = z.object({ timezone: z.string().min(1).max(80) }).parse(await request.json());
    try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); } catch { throw new Error("Invalid timezone"); }
    await db.update(user).set({ timezone, updatedAt: new Date() }).where(eq(user.id, session.user.id));
    return NextResponse.json({ timezone });
  } catch (error) {
    return apiError(error);
  }
}
