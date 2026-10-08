import { NextRequest, NextResponse } from "next/server";
import { updateHabit } from "@/lib/habits";
import { apiError, requireSession } from "@/lib/session";
import { habitPatch } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const data = habitPatch.parse(await request.json());
    const changed = await updateHabit(session.user.id, id, data);
    if (!changed) return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    return NextResponse.json(changed);
  } catch (error) {
    return apiError(error);
  }
}
