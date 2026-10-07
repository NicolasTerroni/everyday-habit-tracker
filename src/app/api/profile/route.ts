import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { user } from "@/db/schema";
import { LOCK_RULES, MAX_LOCK_WINDOWS } from "@/lib/focus-lock";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireSession();
    const data = z.object({
      timezone: z.string().min(1).max(80).optional(),
      lockRule: z.enum(LOCK_RULES).optional(),
      lockWindows: z.array(z.object({ start: time, end: time }).refine((range) => range.start !== range.end, "A range must end at a different time than it starts"))
        .max(MAX_LOCK_WINDOWS).optional()
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
