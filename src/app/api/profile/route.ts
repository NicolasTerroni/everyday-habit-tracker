import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { LOCK_RULES } from "@/lib/focus-lock";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = z.object({
      timezone: z.string().min(1).max(80).optional(),
      lockRule: z.enum(LOCK_RULES).optional()
    }).parse(await request.json());
    if (data.timezone) {
      try { new Intl.DateTimeFormat("en", { timeZone: data.timezone }).format(); } catch { throw new Error("Invalid timezone"); }
    }
    await db.update(user).set({ ...data, updatedAt: new Date() }).where(eq(user.id, session.user.id));
    return NextResponse.json(data);
  } catch (error) {
    return apiError(error);
  }
}
