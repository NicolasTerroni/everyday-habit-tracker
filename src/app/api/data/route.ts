import { NextRequest, NextResponse } from "next/server";
import { todayIn } from "@/lib/dates";
import { loadHabitData } from "@/lib/habit-data";
import { apiError, requireSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const timezone = session.user.timezone || "Europe/Rome";
    const from = request.nextUrl.searchParams.get("from") || todayIn(timezone);
    const to = request.nextUrl.searchParams.get("to") || from;
    const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
    return NextResponse.json(await loadHabitData(session.user.id, timezone, from, to, includeArchived));
  } catch (error) {
    return apiError(error);
  }
}
