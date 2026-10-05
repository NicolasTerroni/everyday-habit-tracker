import { NextRequest, NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { loadHabitData } from "@/lib/habit-data";
import { integrationError, integrationOwner } from "@/lib/integration";

export const dynamic = "force-dynamic";

const MAX_DAYS = 400;

// Habits, entries and reminders of the integration's account for a date range (archived habits included).
export async function GET(request: NextRequest) {
  const auth = await integrationOwner(request);
  if ("error" in auth) return auth.error;
  const { owner } = auth;
  try {
    const to = request.nextUrl.searchParams.get("to") || todayIn(owner.timezone);
    const from = request.nextUrl.searchParams.get("from") || to;
    const days = (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000;
    if (!(days >= 0 && days <= MAX_DAYS)) {
      return NextResponse.json({ error: `Use a range of 0 to ${MAX_DAYS} days` }, { status: 400 });
    }
    return NextResponse.json(await loadHabitData(owner.id, owner.timezone, from, to, true), {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (err) {
    return integrationError(err);
  }
}
