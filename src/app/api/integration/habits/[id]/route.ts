import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { habits } from "@/db/schema";
import { integrationError, integrationOwner } from "@/lib/integration";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// Only what an integration may change on a habit: whether the focus lock requires it today
// (a training coach turns it on for training days and off for rest days).
const habitPatch = z.object({ nonNegotiable: z.boolean() }).strict();

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const id = z.string().uuid().parse((await params).id);
    const data = habitPatch.parse(await request.json());
    const [changed] = await db.update(habits).set({ ...data, updatedAt: new Date() })
      .where(and(eq(habits.id, id), eq(habits.userId, owner.id))).returning();
    if (!changed) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    return NextResponse.json(changed);
  } catch (err) {
    return integrationError(err);
  }
}
