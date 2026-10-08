import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { updateHabit } from "@/lib/habits";
import { integrationError, integrationOwner } from "@/lib/integration";
import { habitPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

// What an integration (the vault's agents) may change on a habit: name, description, target, unit, icon, color, the
// focus-lock flag (a coach turns it on for training days only), and archive/restore. Not its type or position.
const integrationPatch = habitPatch.omit({ type: true, sortOrder: true }).strict();

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const id = z.string().uuid().parse((await params).id);
    const changed = await updateHabit(owner.id, id, integrationPatch.parse(await request.json()));
    if (!changed) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    return NextResponse.json(changed);
  } catch (err) {
    return integrationError(err);
  }
}
