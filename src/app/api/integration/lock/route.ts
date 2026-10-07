import { NextRequest, NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { lockStatus, timeIn } from "@/lib/focus-lock";
import { loadHabitData } from "@/lib/habit-data";
import { integrationError, integrationOwner } from "@/lib/integration";

export const dynamic = "force-dynamic";

// Whether distracting apps should stay locked right now, for an iPhone Shortcut that runs when one opens.
export async function GET(request: NextRequest) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const today = todayIn(owner.timezone);
    const data = await loadHabitData(owner.id, owner.timezone, today, today, false);
    const status = lockStatus(owner.lockRule, owner.lockWindows, timeIn(new Date(), owner.timezone), data.habits.filter((habit) => habit.active), data.entries);
    return NextResponse.json({ ...status, date: today }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return integrationError(err);
  }
}
